/**
 * AUTO-GENERATED GRAPHQL OPERATIONS & MANIFEST
 * DO NOT EDIT MANUALLY. Run 'pnpm gen:graphql' to regenerate.
 */

export interface GraphQLOperationManifest {
  query: string;
  hash: string;
  operationType: 'query' | 'mutation' | 'subscription';
}

export const GRAPHQL_OPERATIONS = {
  "Login": {
    "query": "mutation Login($email: String!, $password: String!) {\n  login(email: $email, password: $password) {\n    user {\n      id\n      email\n      role\n    }\n    accessToken\n  }\n}",
    "hash": "81febfe72e2a7fc70678f5176ef1b3a0167351b92aaf8078a00ebf568190f8b2",
    "operationType": "mutation"
  },
  "Me": {
    "query": "query Me {\n  me {\n    id\n    email\n    role\n  }\n}",
    "hash": "7d8e966e6333d7fc440ad113551988fedcb7e8152ecbe91a8620a90739e4cd91",
    "operationType": "query"
  },
  "RequestFileUpload": {
    "query": "mutation RequestFileUpload($input: RequestFileUploadInput!) {\n  requestFileUpload(input: $input) {\n    fileId\n    uploadUrl\n    expiresAt\n  }\n}",
    "hash": "694305f5d9bb901230e665815b8598a0244678f137c748541f078df43a534519",
    "operationType": "mutation"
  },
  "ConfirmFileUpload": {
    "query": "mutation ConfirmFileUpload($fileId: String!) {\n  confirmFileUpload(fileId: $fileId) {\n    id\n    key\n    status\n    mimeType\n    size\n  }\n}",
    "hash": "baec225ac79e92fdb9d1107b97d684bed7bab302f2630159830ac15d5ae2ddb6",
    "operationType": "mutation"
  },
  "GetUser": {
    "query": "query GetUser($id: String!) {\n  user(id: $id) {\n    id\n    email\n    role\n  }\n}",
    "hash": "4274286bfb7c136fab30d16fb71a144f0ae0291f1671b9ca2c44369e0c9afecc",
    "operationType": "query"
  },
  "UsersConnection": {
    "query": "query UsersConnection($first: Int, $after: String) {\n  usersConnection(first: $first, after: $after) {\n    edges {\n      cursor\n      node {\n        id\n        email\n        role\n      }\n    }\n    pageInfo {\n      hasNextPage\n      hasPreviousPage\n      startCursor\n      endCursor\n    }\n    totalCount\n  }\n}",
    "hash": "5b871ec80fca0633b9946993af2aa6fcaa2e03b51662d13434c557b69ab17ca2",
    "operationType": "query"
  }
} as const;

export type OperationName = keyof typeof GRAPHQL_OPERATIONS;

export interface GraphQLRequestOptions {
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
  persistedOnly?: boolean;
}

export interface GraphQLResponse<TData = unknown> {
  data?: TData;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
    extensions?: {
      code?: string;
      requestId?: string;
      [key: string]: unknown;
    };
  }>;
}
