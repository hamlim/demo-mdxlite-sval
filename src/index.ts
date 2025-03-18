import type { Expression, Program } from "estree";

import { visit as estreeVisit } from "estree-util-visit";
import { renderToReadableStream } from "react-dom/server";
// mdxlite:
import remarkMdx from "remark-mdx";
import Sval from "sval";

import { transformMarkdown } from "./mdxlite";

// STARTNEW
function createEvaluater(interpreter: Sval) {
  let id = 0;
  return {
    evaluateExpression(expression: Expression) {
      let exportName = `_evaluateExpressionValue_${id++}`;
      let program = {
        type: "Program",
        start: 0,
        end: 41,
        body: [
          {
            type: "ExportNamedDeclaration",
            start: 0,
            end: 41,
            declaration: {
              type: "VariableDeclaration",
              start: 7,
              end: 41,
              declarations: [
                {
                  type: "VariableDeclarator",
                  start: 11,
                  end: 41,
                  id: {
                    type: "Identifier",
                    start: 11,
                    end: 35,
                    name: exportName,
                  },
                  init: expression,
                },
              ],
              kind: "let",
            },
            specifiers: [],
            source: null,
          },
        ],
        sourceType: "module",
      };

      interpreter.run(program);
      const value = interpreter.exports[exportName];
      return value;
    },
    evaluateProgram(program: Program) {
      estreeVisit(program, (node, key, index, parents) => {
        // Sval doesn’t support exports yet.
        if (node.type === "ExportNamedDeclaration" && node.declaration) {
          const parent = parents[parents.length - 1];
          parent[key][index] = node.declaration;
        }
      });

      // @ts-expect-error: note: `sval` types are wrong, programs are nodes.
      interpreter.run(program);
    },
  };
}
// ENDNEW

let mdx = `# hello world!

import { foo } from "./bar";

foo: {foo}

4+5 = {4+5}

export const baz = "hello";

baz: {baz}
`;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return new Response(
      await renderToReadableStream(
        await transformMarkdown({
          markdown: mdx,
          remarkRehypeOptions: {
            allowDangerousHtml: true,
            passThrough: [
              "mdxjsEsm",
              "mdxFlowExpression",
              "mdxJsxFlowElement",
              "mdxJsxTextElement",
              "mdxTextExpression",
            ],
          },
          createEvaluater() {
            let thing = new Sval({
              sandBox: true,
              sourceType: "module",
            });
            thing.import({
              "./bar": {
                foo: "something",
              },
            });
            return createEvaluater(thing);
          },
          remarkPlugins: [remarkMdx],
        }),
      ),
      {
        headers: {
          "Content-Type": "text/html",
        },
      },
    );
  },
} satisfies ExportedHandler<Env>;
