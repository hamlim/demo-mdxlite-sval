// STARTNEW
import type { Expression, Program } from "estree";
// ENDNEW
import type { Element, Parents, Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
// STARTNEW
import type { Evaluater } from "hast-util-to-jsx-runtime";
// ENDNEW
import { urlAttributes } from "html-url-attributes";
import type { ComponentType, ReactNode } from "react";
import type { ReactElement } from "react";
import type { JSX } from "react/jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
// STARTNEW
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import remarkRehype from "remark-rehype";
// STARTNEW
import Sval from "sval";
// ENDNEW
import type { PluggableList, Processor } from "unified";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { BuildVisitor } from "unist-util-visit";
import { VFile } from "vfile";
// ENDNEW

export type UrlTransform = (
  url: string,
  key: string,
  node: Readonly<Element>,
) => string | null | undefined;

export type AllowElement = (
  element: Readonly<Element>,
  index: number,
  parent: Readonly<Parents> | undefined,
) => boolean | null | undefined;

export type ExtraProps = {
  node?: Element;
};

export type Components = {
  [Key in keyof JSX.IntrinsicElements]?:
    | ComponentType<JSX.IntrinsicElements[Key] & ExtraProps>
    | keyof JSX.IntrinsicElements;
};

export type Options = {
  /** Markdown. */
  markdown?: string | null | undefined;
  /** Map tag names to components. */
  components?: Components | null | undefined;
  /** Filter elements (optional); `allowedElements` / `disallowedElements` is used first. */
  allowElement?: AllowElement | null | undefined;
  /** Tag names to allow (default: all tag names); cannot combine w/ `disallowedElements`. */
  allowedElements?: ReadonlyArray<string> | null | undefined;
  /** Tag names to disallow (default: `[]`); cannot combine w/ `allowedElements`. */
  disallowedElements?: ReadonlyArray<string> | null | undefined;
  /** List of rehype plugins to use. */
  rehypePlugins?: PluggableList | null | undefined;
  /** List of remark plugins to use. */
  remarkPlugins?: PluggableList | null | undefined;
  /** Options to pass through to `remark-rehype`. */
  remarkRehypeOptions?: Readonly<RemarkRehypeOptions> | null | undefined;
  /** Ignore HTML in markdown completely (default: `false`). */
  skipHtml?: boolean | null | undefined;
  /**
   * Extract (unwrap) what's in disallowed elements (default: `false`);
   * normally when say `strong` is not allowed, it and it's children are dropped,
   * with `unwrapDisallowed` the element itself is replaced by its children.
   */
  unwrapDisallowed?: boolean | null | undefined;
  /** Change URLs (default: `defaultUrlTransform`) */
  urlTransform?: UrlTransform | null | undefined;
};

// STARTNEW
// @ts-expect-error
const emptyPlugins: Array<PluggableList> = [remarkMdx];
// ENDNEW
const emptyRemarkRehypeOptions: Readonly<RemarkRehypeOptions> = {
  allowDangerousHtml: true,
};

export function createProcessor(
  options: Options,
): Processor<Root, Root, Root, undefined, undefined> {
  const rehypePlugins = options.rehypePlugins || emptyPlugins;
  const remarkPlugins = options.remarkPlugins || emptyPlugins;
  const remarkRehypeOptions = options.remarkRehypeOptions
    ? { ...options.remarkRehypeOptions, ...emptyRemarkRehypeOptions }
    : emptyRemarkRehypeOptions;

  const processor = unified()
    .use(remarkParse)
    .use(...remarkPlugins.flat())
    .use(remarkRehype, remarkRehypeOptions)
    .use(...rehypePlugins.flat());

  return processor as Processor<Root, Root, Root, undefined, undefined>;
}

export function createFile(options: Options): VFile {
  const markdown = options.markdown || "";
  const file = new VFile();

  if (typeof markdown === "string") {
    file.value = markdown;
  } else {
    throw new Error(
      `Unexpected value \`${markdown}\` for \`markdown\` prop, expected \`string\``,
    );
  }

  return file;
}

const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i;

export function defaultUrlTransform(value: string): string | undefined | null {
  // Same as:
  // <https://github.com/micromark/micromark/blob/929275e/packages/micromark-util-sanitize-uri/dev/index.js#L34>
  // But without the `encode` part.
  const colon = value.indexOf(":");
  const questionMark = value.indexOf("?");
  const numberSign = value.indexOf("#");
  const slash = value.indexOf("/");

  if (
    // If there is no protocol, it’s relative.
    colon === -1 ||
    // If the first colon is after a `?`, `#`, or `/`, it’s not a protocol.
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign) ||
    // It is a protocol, it should be allowed.
    safeProtocol.test(value.slice(0, colon))
  ) {
    return value;
  }

  return "";
}

export function post(tree: Root, options: Options): ReactElement {
  const allowedElements = options.allowedElements;
  const allowElement = options.allowElement;
  const components = options.components;
  const disallowedElements = options.disallowedElements;
  const skipHtml = options.skipHtml;
  const unwrapDisallowed = options.unwrapDisallowed;
  const urlTransform = options.urlTransform || defaultUrlTransform;
  const createEvaluater = options.createEvaluater || null;

  if (allowedElements && disallowedElements) {
    throw new Error(
      "Unexpected combined `allowedElements` and `disallowedElements`, expected one or the other",
    );
  }

  visit(tree, transform);

  return toJsxRuntime(tree, {
    Fragment,
    components,
    ignoreInvalidStyle: true,
    jsx,
    jsxs,
    passKeys: true,
    passNode: true,
    // STARTNEW
    createEvaluater,
    // ENDNEW
  });

  type TransformParams = Parameters<BuildVisitor<Root>>;
  function transform(
    node: TransformParams[0],
    index: TransformParams[1],
    parent: TransformParams[2],
  ): ReturnType<BuildVisitor<Root>> {
    if (node.type === "raw" && parent && typeof index === "number") {
      if (skipHtml) {
        parent.children.splice(index, 1);
      } else {
        parent.children[index] = { type: "text", value: node.value };
      }

      return index;
    }

    if (node.type === "element") {
      let key: string;

      for (key in urlAttributes) {
        if (
          Object.hasOwn(urlAttributes, key) &&
          Object.hasOwn(node.properties, key)
        ) {
          const value = node.properties[key];
          const test = urlAttributes[key];
          if (test === null || test.includes(node.tagName)) {
            node.properties[key] = urlTransform(String(value || ""), key, node);
          }
        }
      }
    }

    if (node.type === "element") {
      let remove = allowedElements
        ? !allowedElements.includes(node.tagName)
        : disallowedElements
          ? disallowedElements.includes(node.tagName)
          : false;

      if (!remove && allowElement && typeof index === "number") {
        remove = !allowElement(node, index, parent);
      }

      if (remove && parent && typeof index === "number") {
        if (unwrapDisallowed && node.children) {
          parent.children.splice(index, 1, ...node.children);
        } else {
          parent.children.splice(index, 1);
        }

        return index;
      }
    }
  }
}

export async function transformMarkdown(options: Options): Promise<ReactNode> {
  const processor = createProcessor(options);
  const file = createFile(options);
  const tree = await processor.run(processor.parse(file), file);
  return post(tree as Root, options);
}
