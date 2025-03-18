import type { Expression, Program } from "estree";
import type { Root } from "hast";
import type { Evaluater } from "hast-util-to-jsx-runtime";
import { renderToReadableStream } from "react-dom/server";
// mdxlite:
import remarkMdx from "remark-mdx";
import Sval from "sval";
import { visit } from "unist-util-visit";
import { transformMarkdown } from "./mdxlite";

// STARTNEW
let evaluater: Evaluater;
function createEvaluater(): Evaluater {
  if (evaluater) {
    return evaluater;
  }
  let interpreter = new Sval({
    sandBox: true,
  });

  interpreter.import({
    foo: {
      foo: "something",
    },
  });
  console.log(interpreter);
  evaluater = {
    evaluateExpression(expression: Expression) {
      const program = {
        type: "Program",
        start: 0,
        end: 22,
        loc: {
          start: {
            line: 1,
            column: 0,
            index: 0,
          },
          end: {
            line: 1,
            column: 22,
            index: 22,
          },
        },
        sourceType: "module",
        interpreter: null,
        body: [
          {
            type: "ExpressionStatement",
            start: 0,
            end: 22,
            loc: {
              start: {
                line: 1,
                column: 0,
                index: 0,
              },
              end: {
                line: 1,
                column: 22,
                index: 22,
              },
            },
            expression: {
              type: "AssignmentExpression",
              start: 0,
              end: 22,
              loc: {
                start: {
                  line: 1,
                  column: 0,
                  index: 0,
                },
                end: {
                  line: 1,
                  column: 22,
                  index: 22,
                },
              },
              operator: "=",
              left: {
                type: "MemberExpression",
                start: 0,
                end: 14,
                loc: {
                  start: {
                    line: 1,
                    column: 0,
                    index: 0,
                  },
                  end: {
                    line: 1,
                    column: 14,
                    index: 14,
                  },
                },
                object: {
                  type: "Identifier",
                  start: 0,
                  end: 7,
                  loc: {
                    start: {
                      line: 1,
                      column: 0,
                      index: 0,
                    },
                    end: {
                      line: 1,
                      column: 7,
                      index: 7,
                    },
                    identifierName: "exports",
                  },
                  name: "exports",
                },
                computed: false,
                property: {
                  type: "Identifier",
                  start: 8,
                  end: 14,
                  loc: {
                    start: {
                      line: 1,
                      column: 8,
                      index: 8,
                    },
                    end: {
                      line: 1,
                      column: 14,
                      index: 14,
                    },
                    identifierName: "_evaluateExpressionValue",
                  },
                  name: "_evaluateExpressionValue",
                },
              },
              right: expression,
            },
          },
        ],
        directives: [],
      };

      interpreter.run(program);
      const value = interpreter.exports._evaluateExpressionValue;
      interpreter.exports._evaluateExpressionValue = undefined;
      return value;
    },
    evaluateProgram(program: Program) {
      console.log(program);
      // @ts-expect-error
      interpreter.run(program);
    },
    // @ts-ignore
    interpreter,
  };
  return evaluater;
}
// ENDNEW

function transformerPlugin() {
  let evaluater: Evaluater;
  return function transformer(tree: Root) {
    evaluater = createEvaluater();
    visit(tree, (node) => {
      console.log(node.type);
      if (node.type === "mdxTextExpression") {
        node.value = evaluater.evaluateExpression(
          node.data.estree.body[0].expression,
        );
      } else if (node.type === "mdxjsEsm") {
        node.value = evaluater.evaluateProgram(node.data.estree);
      }
    });
  };
}

let mdx = `# hello world!

4+5 = {4+5}

{foo}
`;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    let thing = new Sval({
      sandBox: false,
      sourceType: "module",
    });
    thing.import({
      foo: {
        foo: "something",
      },
    });
    thing.run(`import { foo } from "./foo"; console.log(foo);`);
    console.log(thing.exports);
    return new Response(
      await renderToReadableStream(
        await transformMarkdown({
          markdown: mdx,
          createEvaluater,
          remarkPlugins: [transformerPlugin, remarkMdx],
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
