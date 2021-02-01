// ----------------------------------
//         Node generation
// ----------------------------------

type NodeGenerationType = "SingleFile" | "MultiFile";

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
  [key: string]: Resource;
}

type Resource = Operation[];

interface Operation {
  [key: string]:
    | string
    | OperationParameter[]
    | OperationRequestBodyComponent[]
    | AdditionalFields
    | undefined;
  operationId: string;
  description: string;
  requestMethod: string;
  endpoint: string;
  parameters?: OperationParameter[];
  requestBody?: OperationRequestBodyComponent[];
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
}

interface OperationRequestBodyComponent {
  description?: string;
  required: boolean;
  content: OperationRequestBodyComponentContent;
}

interface OperationRequestBodyComponentContent {
  [key: "application/x-www-form-urlencoded"]: AppFormUrlEncoded;
  [key: "text/plain"]: TextPlain;
  "application/x-www-form-urlencoded": AppFormUrlEncoded;
  "text/plain": TextPlain;
}

interface AppFormUrlEncoded {
  schema: {
    type: "object";
    properties: {
      [key: string]: {
        type: string;
        description: string;
      };
    };
  };
}

interface TextPlain {
  "text/plain": {
    schema: {
      type: string;
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
