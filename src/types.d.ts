// ----------------------------------
//         Node generation
// ----------------------------------

type AuthType = "OAuth2" | "ApiKey" | "None";

type NodegenParams = {
  metaParams: MetaParams;
  mainParams: MainParams;
};

type MetaParams = {
  serviceName: string;
  authType: keyof typeof AuthType;
  nodeColor: string;
  apiUrl: string;
};

interface MainParams {
  [key: string]: Operation[];
}

type Resource = Operation[];

interface Operation {
  [key: string]:
    | string
    | OperationParameter[]
    | OperationRequestBody
    | AdditionalFields
    | undefined;
  operationId: string;
  description: string;
  requestMethod: string;
  endpoint: string;
  parameters?: OperationParameter[];
  requestBody?: OperationRequestBody;
  additionalFields?: AdditionalFields;
}

interface OperationParameter {
  in: "path" | "query";
  name: string;
  description?: string;
  schema: {
    type: string;
    default?: boolean | string | number | null;
    example?: string | number;
    minimum?: number;
    maximum?: number;
  };
  required?: boolean;
  example?: string;
  $ref?: string;
}

interface OperationRequestBody {
  content?: OperationRequestBodyContent | any; // TODO
  description?: string;
  required?: boolean;
}

interface OperationRequestBodyContent {
  [key: string]: { schema: Schema };
  "application/x-www-form-urlencoded": { schema: Schema };
  "text/plain": { schema: Schema };
}

interface Schema {
  type: string;
  required?: string[];
  properties: {
    [key: string]: {
      type: string;
      description: string;
    };
  };
}

interface AdditionalFields {
  name: "Additional Fields";
  type: "collection";
  description: "";
  default: {};
  options: {
    in: "path" | "query";
    name: string;
    type: string;
    default: string | boolean | number;
    description?: string;
  }[];
}

// ----------------------------------
//          OpenAPI keys
// ----------------------------------

type OpenApiKey = StringArrayKey | StringKey | CustomObjectKey;

type StringArrayKey = "tags" | "requestMethods";

type StringKey = "description" | "operationId";

type CustomObjectKey = "parameters" | "requestBody";

// ----------------------------------
//              JSON
// ----------------------------------

type JsonObject = { [key in string]: JsonValue };

type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | JsonObject;

// ----------------------------------
//        Module augmentation
// ----------------------------------

declare module "object-treeify" {
  export default function treeify(jsObject: Object): string;
}

// ----------------------------------
//             Builder
// ----------------------------------

type GetCallLineOptionalArgs = {
  withQueryString?: boolean;
  withRequestBody?: boolean;
};

// ----------------------------------
//            Printer
// ----------------------------------

type ApiMap = {
  [key: string]: ApiMapOperation[];
};

type ApiMapOperation = {
  ATTENTION?: string;
  nodeOperation: string;
  requestMethod;
  endpoint: string;
  IRREGULAR?: string;
};

type TreeView = string;
