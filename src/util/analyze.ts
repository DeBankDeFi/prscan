import * as t from "@babel/types";
import { parse } from "@babel/parser";

import _traverse, { type Visitor, type NodePath } from "@babel/traverse";

// 使用 require 方式导入以获得正确的类型
const traverse: (node: t.Node, visitor: Visitor) => void = _traverse.default as any;

export type GlobalUsageMap = Record<string, "r" | "rw">;

export const ECMAGlobals = [
    "AggregateError",
    "Array",
    "ArrayBuffer",
    "Atomics",
    "BigInt",
    "BigInt64Array",
    "BigUint64Array",
    "Boolean",
    "DataView",
    "Date",
    "Error",
    "EvalError",
    "FinalizationRegistry",
    "Float16Array",
    "Float32Array",
    "Float64Array",
    "Function",
    "Infinity",
    "Int16Array",
    "Int32Array",
    "Int8Array",
    "Intl",
    "Iterator",
    "JSON",
    "Map",
    "Math",
    "NaN",
    "Number",
    "Object",
    "Promise",
    "Proxy",
    "RangeError",
    "ReferenceError",
    "Reflect",
    "RegExp",
    "Set",
    "SharedArrayBuffer",
    "String",
    "Symbol",
    "SyntaxError",
    "TypeError",
    "Uint16Array",
    "Uint32Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "URIError",
    "WeakMap",
    "WeakRef",
    "WeakSet",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    // "eval",
    "globalThis",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "undefined",
    "unescape",
];

class GVPool {
    public globals: Map<string, "r" | "rw"> = new Map();

    add(name: string, perm: "r" | "rw") {
        // 不管控除eval以外的ECMA全局变量的读权限
        if (ECMAGlobals.includes(name) && perm === "r") {
            return;
        }

        if (this.globals.has(name)) {
            if (perm === "rw") {
                this.globals.set(name, "rw");
            }
        } else {
            this.globals.set(name, perm);
        }
    }
}

export function analyzeGlobals(code: string): GlobalUsageMap {
    const pool = new GVPool();

    const ast = parse(code, {
        sourceType: "unambiguous",
    });

    traverse(ast, {
        MemberExpression(path: NodePath<t.MemberExpression>) {
            let expr: string[] = [];
            let node: t.MemberExpression = path.node;
            let flag = true;
            while (t.isMemberExpression(node)) {
                if (t.isIdentifier(node.property) && !node.computed) {
                    expr.unshift(node.property.name);
                } else if (t.isStringLiteral(node.property)) {
                    expr.unshift(node.property.value);
                } else {
                    flag = false;
                    break;
                }

                if (t.isIdentifier(node.object)) {
                    expr.unshift(node.object.name);
                    break;
                } else if (t.isMemberExpression(node.object)) {
                    node = node.object;
                } else {
                    flag = false;
                    break;
                }
            }

            if (!flag) {
                return;
            }

            // 处理 __webpack_require__.g.xxx 的情况, __webpack_require__.g 就是 globalThis
            if (
                expr.length >= 2 &&
                expr[0] === "__webpack_require__" &&
                expr[1] === "g"
            ) {
                expr = expr.slice(2);
            }

            const globalAlias = ["globalThis", "self", "window"];
            let mustBeGlobal = false;
            while (
                expr.length > 0 &&
                globalAlias.includes(expr[0]!) &&
                !path.scope.hasBinding(expr[0]!, { noGlobals: true })
            ) {
                expr = expr.slice(1);
                // 如果是globalThis/self/window开头的, 则一定是全局变量
                mustBeGlobal = true;
            }

            if (
                expr.length > 0 &&
                (mustBeGlobal ||
                    !path.scope.hasBinding(expr[0]!, { noGlobals: true })) &&
                expr[0] !== "arguments"
            ) {
                pool.add(
                    expr[0]!,

                    t.isAssignmentExpression(path.parent) &&
                        path.parent.left === path.node &&
                        expr.length === 1
                        ? "rw"
                        : "r"
                );
            }

            path.skip();
        },
        Identifier(path: NodePath<t.Identifier>) {
            if (!path.scope.hasBinding(path.node.name, { noGlobals: true })) {
                // 排除一些不算真正变量读取的场景
                if (
                    (t.isMemberExpression(path.parent) ||
                        t.isOptionalMemberExpression(path.parent)) &&
                    path.parent.property === path.node
                ) {
                    return;
                } else if (
                    t.isObjectProperty(path.parent) &&
                    path.parent.key === path.node
                ) {
                    return;
                } else if (
                    (t.isLabeledStatement(path.parent) ||
                        t.isBreakStatement(path.parent) ||
                        t.isContinueStatement(path.parent)) &&
                    path.parent.label === path.node
                ) {
                    return;
                } else if (
                    (t.isFunctionDeclaration(path.parent) ||
                        t.isFunctionExpression(path.parent)) &&
                    path.parent.id === path.node
                ) {
                    return;
                } else if (
                    t.isCatchClause(path.parent) &&
                    path.parent.param === path.node
                ) {
                    return;
                } else if (
                    t.isFunction(path.parent) &&
                    (path.parent.params.includes(path.node) ||
                        (path.parent as any).id === path.node ||
                        (path.parent as any).kind === path.node.name ||
                        (path.parent as any).key === path.node)
                ) {
                    return;
                } else if (t.isMetaProperty(path.parent)) {
                    return;
                } else if (
                    t.isClassProperty(path.parent) &&
                    path.parent.key === path.node
                ) {
                    return;
                    // globalAlias默认可访问
                } else if (
                    path.node.name === "globalThis" ||
                    path.node.name === "window" ||
                    path.node.name === "self"
                ) {
                    return;
                } else if (path.node.name === "arguments") {
                    return;
                }

                pool.add(
                    path.node.name,

                    t.isAssignmentExpression(path.parent) &&
                        path.parent.left === path.node
                        ? "rw"
                        : "r"
                );
            }
        },
    });

    const obj: GlobalUsageMap = Object.create(null);
    for (const [name, perm] of pool.globals.entries()) {
        obj[name] = perm;
    }

    return obj;
}
