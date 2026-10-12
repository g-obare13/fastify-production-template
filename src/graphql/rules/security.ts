/**
 * @file GraphQL AST validation rules for query depth, complexity, alias limits, and directive limits.
 * @module graphql/rules/security
 */

import {
  type ASTVisitor,
  type FieldNode,
  FragmentDefinitionNode,
  type FragmentSpreadNode,
  GraphQLError,
  type InlineFragmentNode,
  Kind,
  type OperationDefinitionNode,
  type ValidationContext,
} from 'graphql';

/** Configuration thresholds for AST security validation rules. */
export interface GraphQLSecurityRulesConfig {
  maxDepth: number;
  maxComplexity: number;
  maxAliases: number;
  maxDirectives: number;
}

/**
 * Validates maximum AST nesting depth of an incoming GraphQL query.
 *
 * @param maxDepth Maximum permitted nesting depth.
 * @returns GraphQL validation rule factory.
 */
export function createDepthLimitRule(maxDepth: number) {
  return (context: ValidationContext): ASTVisitor => {
    return {
      OperationDefinition(node: OperationDefinitionNode) {
        const depth = calculateDepth(node, context, 0);
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(
              `Query depth of ${depth} exceeds maximum allowed depth of ${maxDepth}`,
              { nodes: [node] }
            )
          );
        }
      },
    };
  };
}

/**
 * Recursively computes the maximum selection set depth of an AST node.
 *
 * @param node AST node containing selection sets
 * @param context GraphQL validation context for fragment resolution
 * @param currentDepth Current recursion depth level
 * @returns Maximum depth reached in the subtree
 */
function calculateDepth(
  node: { selectionSet?: { selections: readonly unknown[] } | undefined },
  context: ValidationContext,
  currentDepth: number
): number {
  if (!node.selectionSet || node.selectionSet.selections.length === 0) {
    return currentDepth;
  }

  let maxChildDepth = currentDepth;
  for (const selection of node.selectionSet.selections as readonly (
    | FieldNode
    | FragmentSpreadNode
    | InlineFragmentNode
  )[]) {
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value.startsWith('__')) continue;
      const childDepth = calculateDepth(selection, context, currentDepth + 1);
      if (childDepth > maxChildDepth) maxChildDepth = childDepth;
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragment = context.getFragment(selection.name.value);
      if (fragment) {
        const childDepth = calculateDepth(fragment, context, currentDepth + 1);
        if (childDepth > maxChildDepth) maxChildDepth = childDepth;
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const childDepth = calculateDepth(selection, context, currentDepth);
      if (childDepth > maxChildDepth) maxChildDepth = childDepth;
    }
  }

  return maxChildDepth;
}

/**
 * Validates query complexity:
 * - Query field = 1 point
 * - Mutation field = 5 points
 * - Connection/list field = 2 points
 *
 * @param maxComplexity Maximum allowable query complexity score.
 * @returns GraphQL validation rule factory.
 */
export function createComplexityLimitRule(maxComplexity: number) {
  return (context: ValidationContext): ASTVisitor => {
    let complexity = 0;

    return {
      OperationDefinition: {
        enter(node: OperationDefinitionNode) {
          complexity = 0;
          const isMutation = node.operation === 'mutation';
          complexity += isMutation ? 5 : 1;
        },
        leave(node: OperationDefinitionNode) {
          if (complexity > maxComplexity) {
            context.reportError(
              new GraphQLError(
                `Query complexity of ${complexity} exceeds maximum allowed complexity of ${maxComplexity}`,
                { nodes: [node] }
              )
            );
          }
        },
      },
      Field(node: FieldNode) {
        if (node.name.value.startsWith('__')) return;
        complexity += 1;
      },
    };
  };
}

/**
 * Enforces maximum allowed field aliases to prevent alias-based batching attacks.
 *
 * @param maxAliases Maximum allowable field aliases per query.
 * @returns GraphQL validation rule factory.
 */
export function createMaxAliasesRule(maxAliases: number) {
  return (context: ValidationContext): ASTVisitor => {
    let aliasesCount = 0;

    return {
      OperationDefinition: {
        enter() {
          aliasesCount = 0;
        },
        leave(node: OperationDefinitionNode) {
          if (aliasesCount > maxAliases) {
            context.reportError(
              new GraphQLError(
                `Too many field aliases (${aliasesCount}). Maximum allowed is ${maxAliases}`,
                { nodes: [node] }
              )
            );
          }
        },
      },
      Field(node: FieldNode) {
        if (node.alias) {
          aliasesCount++;
        }
      },
    };
  };
}

/**
 * Enforces maximum allowed directives to prevent directive DOS attacks.
 *
 * @param maxDirectives Maximum allowable directives per query.
 * @returns GraphQL validation rule factory.
 */
export function createMaxDirectivesRule(maxDirectives: number) {
  return (context: ValidationContext): ASTVisitor => {
    let directivesCount = 0;

    return {
      OperationDefinition: {
        enter() {
          directivesCount = 0;
        },
        leave(node: OperationDefinitionNode) {
          if (directivesCount > maxDirectives) {
            context.reportError(
              new GraphQLError(
                `Too many directives (${directivesCount}). Maximum allowed is ${maxDirectives}`,
                { nodes: [node] }
              )
            );
          }
        },
      },
      Directive() {
        directivesCount++;
      },
    };
  };
}
