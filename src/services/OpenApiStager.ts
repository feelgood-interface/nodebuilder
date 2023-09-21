import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { JSONPath as jsonQuery } from "jsonpath-plus";
import { titleCase } from "title-case";
import { camelCase } from "change-case";
import pluralize from "pluralize";
import { inputDir, openApiInputDir, swagger } from "../config";
import * as _ from "lodash";

export default class OpenApiStager {
  private readonly json: JsonObject & { paths: object };
  private readonly serviceName: string;
  private currentEndpoint: string;
  private currentResource: string;
  private currentMethod: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName.replace(".json", "");
    this.json = this.parseSpec(serviceName);
  }

  public run(): NodegenParams {
    return {
      metaParams: {
        apiUrl: this.getApiUrl(),
        authType: this.getAuthType(),
        serviceName: titleCase(this.serviceName),
        nodeColor: this.getNodeColor(),
      },
      mainParams: this.getMainParams(),
    };
  }

  /**
   * Replace `$ref` with its referenced value and parse the resulting JSON.
   * */
  private parseSpec(serviceName: string) {
    const source = path.join(openApiInputDir, serviceName);
    const target = path.join(inputDir, "_deref.json");

    execSync(
      `node ${swagger} bundle --dereference ${source} --outfile ${target}`
    );

    return JSON.parse(fs.readFileSync(target).toString());
  }

  private getApiUrl() {
    return jsonQuery({ json: this.json, path: "$.servers.*.url" })[0];
  }

  // TODO: temp implementation
  private getNodeColor() {
    return "#ffffff";
  }

  // TODO: temp implementation
  private getAuthType(): AuthType {
    return "OAuth2";
  }

  private getMainParams() {
    let mainParams: MainParams = {};

    for (const endpoint in this.json.paths) {
      this.currentEndpoint = endpoint;

      const resources = this.getResources();
      const methods = this.extract("requestMethods");

      resources.forEach((resource) => {
        methods.forEach((method) => {
          this.currentResource = resource;
          this.currentMethod = method;
          const operation = this.createOperation(method);
          mainParams[resource] = mainParams[resource] || []; // TODO: nullish-coalescing operator
          mainParams[resource].push(operation);
        });

        mainParams[resource] = this.alphabetizeOperations(mainParams[resource]);
      });
    }

    return this.alphabetizeResources(mainParams);
  }

  private getResources() {
    const resources = this.extract("tags").filter((r) => r !== "OAuth");
    return [...new Set(resources)].map((r) => this.singularize(r));
  }

  private processDescription() {
    const description = this.extract("description");

    if (description) return this.escape(description);
  }

  private processSummary() {
    const summary = this.extract("summary");

    if (summary) return this.escape(summary);
  }

  private escape(description: string) {
    return description
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .replace(/'/g, "\\'")
      .trim();
  }

  private processRequestBody(): OperationRequestBody[] | null {
    const requestBody = this.extract("requestBody");

    if (!requestBody) return null;

    const urlEncoded = requestBody.content["application/x-www-form-urlencoded"];
    const json = requestBody.content["application/json"];
    const textPlain = requestBody.content["text/plain"];

    if (urlEncoded) {
      this.sanitizeProperties(urlEncoded);
    }

    if (json) {
      this.sanitizeProperties(json);
    }

    if (textPlain) {
      this.setTextPlainProperty(requestBody);
    }

    const fieldsName = ["PUT", "PATCH"].includes(
      this.currentMethod.toUpperCase()
    )
      ? "Update Fields"
      : "Additional Fields";

    const requiredBody: OperationRequestBody = {
      name: "Standard",
      content: {},
      required: true,
    };
    if (urlEncoded && urlEncoded.schema?.required?.length) {
      for (const key of Object.keys(urlEncoded.schema.properties)) {
        if (urlEncoded.schema.required.includes(key)) {
          requiredBody.content[
            "application/x-www-form-urlencoded"
          ]!.schema.properties[key] = urlEncoded.schema.properties[key];

          delete urlEncoded.schema.properties[key];
        }
      }

      delete urlEncoded.schema.required;
      if (Object.keys(urlEncoded.schema.properties).length === 0) {
        delete requestBody.content["application/x-www-form-urlencoded"];
      }
    }
    if (json && json.schema?.required?.length) {
      requiredBody.content["application/json"] = {
        schema: { type: json.schema.type, properties: {} },
      };
      for (const key of Object.keys(json.schema.properties)) {
        if (json.schema.required.includes(key)) {
          requiredBody.content["application/json"]!.schema.properties[key] =
            json.schema.properties[key];

          delete json.schema.properties[key];
        }
      }

      delete json.schema.required;
      if (Object.keys(json.schema.properties).length === 0) {
        delete requestBody.content["application/json"];
      }
    }
    if (textPlain && textPlain.schema?.required?.length) {
      for (const key of Object.keys(textPlain.schema.properties)) {
        if (textPlain.schema.required.includes(key)) {
          requiredBody.content[
            "application/x-www-form-urlencoded"
          ]!.schema.properties[key] = textPlain.schema.properties[key];

          delete textPlain.schema.properties[key];
        }
      }
      requiredBody.textPlainProperty = requestBody.textPlainProperty;
      delete textPlain.schema.required;
      if (Object.keys(textPlain.schema.properties).length === 0) {
        delete requestBody.content["text/plain"];
      }
    }

    const operationBody = [];
    if (Object.keys(requiredBody.content).length > 0) {
      operationBody.push(requiredBody);
    }
    if (Object.keys(requestBody.content).length > 0) {
      operationBody.push({
        name: fieldsName,
        ...requestBody,
        required: false,
      } as const);
    }

    return operationBody;
  }

  private setTextPlainProperty(requestBody: OperationRequestBody) {
    requestBody.textPlainProperty = requestBody.description
      ?.split(" ")[0]
      .toLowerCase();
  }

  private sanitizeProperties(body: { schema: RequestBodySchema }) {
    body.schema = this.mergeAllOf(body.schema);
    body.schema = this.mergeAnyOf(body.schema);
    body.schema = this.mergeOneOf(body.schema);

    if (!body.schema.properties) {
      return;
    }

    this.removeReadOnlyOrWriteOnlyProperties(body.schema);
    this.sanitizeEnumProperties(body.schema);

    const properties = Object.keys(body.schema.properties);
    properties.forEach((property) => {
      const sanitizedProperty = camelCase(property.replace(".", " "));

      if (sanitizedProperty !== property) {
        body.schema.properties[sanitizedProperty] =
          body.schema.properties[property];
        delete body.schema.properties[property];
      }
    });

    body.schema.properties = Object.keys(body.schema.properties)
      .sort()
      .reduce((obj: { [propertyName: string]: ParamContent }, key: string) => {
        obj[key] = body.schema.properties[key];
        return obj;
      }, {});
  }

  /** Format enum properties as options type */
  private sanitizeEnumProperties(schema: RequestBodySchema) {
    if (!schema.properties) {
      return;
    }
    const propertyValues = Object.values(schema.properties);
    propertyValues.forEach((value: ParamContent & { enum?: [] }) => {
      if (value.enum) {
        value.type = "options";
        value.options = value.enum;
        delete value.enum;
      }
    });
  }

  private createOperation(requestMethod: string) {
    const operation: Operation = {
      endpoint: this.currentEndpoint,
      requestMethod: requestMethod.toUpperCase(),
      operationId: this.processOperationId(requestMethod),
    };

    const parameters = this.processParameters();
    const requestBody = this.processRequestBody();
    const description = this.processDescription();
    const summary = this.processSummary();

    if (parameters.length) operation.parameters = parameters;
    if (requestBody?.length) operation.requestBody = requestBody;
    if (description) operation.description = description;
    if (summary) operation.summary = summary;

    return operation;
  }

  private processOperationId(requestMethod: string) {
    let extracted = this.extract("operationId");

    if (!extracted) return this.getFallbackId(requestMethod);

    if (extracted.endsWith("ById")) return "get";

    if (extracted.match(/get./)) {
      const words = this.camelCaseToSpaced(extracted).split(" ");
      const lastWord = words.slice(-1).join("");
      return lastWord.endsWith("s") ? "getAll" : extracted;
    }

    const tag = (jsonQuery({
      json: this.json,
      path: `$.paths.[${this.currentEndpoint}].*.tags.*`,
    }) as string[])[0];

    const allTagOperations = (jsonQuery({
      json: this.json,
      path: `$.paths.*.*`,
    }) as any[])
      .filter((x) => x.tags?.includes(tag))
      .map((x) => x.operationId);

    if (extracted.startsWith("edit")) {
      if (allTagOperations.filter((x) => x.startsWith("edit")).length > 1) {
        return extracted.replace("edit", "update");
      } else {
        return "update";
      }
    }

    if (extracted.startsWith("add")) {
      if (allTagOperations.filter((x) => x.startsWith("add")).length > 1) {
        return extracted.replace("add", "create");
      } else {
        return "create";
      }
    }

    if (extracted.startsWith("fetchAll")) {
      if (allTagOperations.filter((x) => x.startsWith("fetchAll")).length > 1) {
        return extracted.replace("fetchAll", "getAll");
      } else {
        return "getAll";
      }
    }

    const surplusPart = this.currentResource.replace(" ", "");
    const surplusRegex = new RegExp(surplusPart, "g");

    return extracted.replace(surplusRegex, "");
  }

  private processParameters() {
    // Operation parameters
    let parameters = this.extract("parameters");

    // Path parameters
    const pathParameters = jsonQuery({
      json: this.json,
      path: `$.paths.[${this.currentEndpoint}].parameters`,
    });
    if (pathParameters.length) {
      parameters = parameters.concat(pathParameters[0]);
    }

    parameters.forEach((param: OperationParameter) => {
      if (param.description) {
        param.description = this.escape(param.description);
      }

      param.schema = this.mergeAllOf(param.schema);
      param.schema = this.mergeAnyOf(param.schema);
      param.schema = this.mergeOneOf(param.schema);

      if (param.schema.enum) {
        param.schema.type = "options";
        param.schema.options = param.schema.enum;
        delete param.schema.enum;
      }
    });

    parameters.sort((a, b) => a.name.localeCompare(b.name));

    parameters = parameters
      .map((field) => (field.required ? field : { ...field, required: false }))
      .sort();

    const queryParameters = parameters.filter((x) => x.in === "query");
    const outputQueryParameters = [
      ...queryParameters.filter((x) => x.required),
    ];
    if (queryParameters.some((x) => !x.required)) {
      outputQueryParameters.push({
        in: "query",
        name: "query",
        schema: {
          type: "object",
          properties: queryParameters
            .filter((x) => !x.required)
            .reduce(
              (result, item) => ({ ...result, [item.name]: item.schema }),
              {}
            ),
          default: "",
        },
      });
    }

    return [
      ...parameters.filter((x) => x.in !== "query"),
      ...outputQueryParameters,
    ];
  }

  // TODO: fix types
  /** Only take first sub-schema */
  private mergeAnyOf(schema: any): any {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
      const firstSchema = this.mergeAnyOf(schema.anyOf[0]);

      // Remove the anyOf keyword and replace it with the first schema
      delete schema.anyOf;
      return { ...firstSchema, ...schema };
    }

    // Recursively merge anyOf schemas in properties
    if (schema.properties) {
      Object.keys(schema.properties).forEach((prop) => {
        schema.properties[prop] = this.mergeAnyOf(schema.properties[prop]);
      });
    }

    // Recursively merge anyOf schemas in items (for arrays)
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        schema.items = schema.items.map((item: any) => this.mergeAnyOf(item));
      } else {
        schema.items = this.mergeAnyOf(schema.items);
      }
    }

    return schema;
  }

  // TODO: fix types
  /** Only take first sub-schema */
  private mergeOneOf(schema: any): any {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
      const firstSchema = this.mergeOneOf(schema.oneOf[0]);

      // Remove the oneOf keyword and replace it with the first schema
      delete schema.oneOf;
      return { ...firstSchema, ...schema };
    }

    // Recursively merge oneOf schemas in properties
    if (schema.properties) {
      Object.keys(schema.properties).forEach((prop) => {
        schema.properties[prop] = this.mergeOneOf(schema.properties[prop]);
      });
    }

    // Recursively merge oneOf schemas in items (for arrays)
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        schema.items = schema.items.map((item: any) => this.mergeOneOf(item));
      } else {
        schema.items = this.mergeOneOf(schema.items);
      }
    }

    return schema;
  }

  private customMerge(object1: {}, object2: {}) {
    return _.mergeWith(object1, object2, (value1, value2) => {
      if (_.isArray(value1) && _.isArray(value2)) {
        return _.concat(value1, value2);
      }
    });
  }

  // TODO: fix types
  /** Merge schemas */
  private mergeAllOf(schema: any): any {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    if (Array.isArray(schema.allOf)) {
      const mergedSchema = {};

      schema.allOf.forEach((subSchema: any) => {
        this.customMerge(mergedSchema, this.mergeAllOf(subSchema));
      });

      delete schema.allOf;
      return this.customMerge(mergedSchema, schema);
    }

    // Recursively merge allOf schemas in properties
    if (schema.properties) {
      Object.keys(schema.properties).forEach((prop) => {
        schema.properties[prop] = this.mergeAllOf(schema.properties[prop]);
      });
    }

    // Recursively merge allOf schemas in items (for arrays)
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        schema.items = schema.items.map((item: any) => this.mergeAllOf(item));
      } else {
        schema.items = this.mergeAllOf(schema.items);
      }
    }

    return schema;
  }

  private removeReadOnlyOrWriteOnlyProperties(schema: any) {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    // Check if the schema has the "readOnly" or "writeOnly" property and matches the HTTP method
    if (
      (schema.readOnly && this.currentMethod.toUpperCase() !== "GET") ||
      (schema.writeOnly && this.currentEndpoint.toUpperCase() === "GET")
    ) {
      return undefined; // Remove the property
    }

    // Recursively check and remove properties in nested objects
    if (schema.properties) {
      Object.keys(schema.properties).forEach((prop) => {
        const updatedProperty = this.removeReadOnlyOrWriteOnlyProperties(
          schema.properties[prop]
        );
        if (updatedProperty === undefined) {
          delete schema.properties[prop]; // Remove the property
        } else {
          schema.properties[prop] = updatedProperty;
        }
      });
    }

    // Recursively check and remove properties in array items
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        schema.items = schema.items.map((item: any) =>
          this.removeReadOnlyOrWriteOnlyProperties(item)
        );
      } else {
        schema.items = this.removeReadOnlyOrWriteOnlyProperties(schema.items);
      }
    }

    return schema;
  }

  // ----------------------------------
  //            extractors
  // ----------------------------------

  /**Extract the keys and values from the OpenAPI JSON based on the current endpoint.
   * Based on [JSON Path Plus](https://github.com/JSONPath-Plus/JSONPath).
   *
   * Note: The square brackets escape chars in the endpoint.*/
  private extract(
    key: "description" | "operationId" | "summary"
  ): string | undefined;
  private extract(key: "tags" | "requestMethods"): string[];
  private extract(key: "parameters"): OperationParameter[];
  private extract(key: "requestBody"): OperationRequestBody | null;
  private extract(key: OpenApiKey) {
    const result = jsonQuery({
      json: this.json,
      path: `$.paths.[${this.currentEndpoint}].${this.setEndOfPath(key)}`,
    });

    if (key === "requestBody" && !result.length) return null;

    // always a one-element array, so remove nesting
    const hasExtraNesting =
      (key === "parameters" && result.length) ||
      key === "description" ||
      key === "operationId" ||
      (key === "requestBody" && result.length) ||
      key === "summary";

    if (hasExtraNesting) return result[0];

    if (key === "requestMethods") {
      // Remove parameters at the path level
      const index = result.indexOf("parameters");
      if (index !== -1) {
        result.splice(index, 1);
      }
    }

    return result;
  }

  /**Adjust the end of the JSON Path query based on the key.
   * ```json
   * $.[/endpoint].   *.tags.*      resources
   * $.[/endpoint].   *~            request methods
   * $.[/endpoint].   *.otherKey
   * ```
   * Note: `parameters` is kept in a nested array (instead of together with `tags`)
   * for the edge case where the endpoint has 2+ request methods. Otherwise, the
   * parameters for both methods become mixed together, causing duplication.*/
  private setEndOfPath(key: OpenApiKey) {
    if (key === "tags") return `*.${key}.*`;
    if (key === "requestMethods") return `*~`;
    if (key === "operationId" || key === "requestBody" || key === "parameters")
      return `${this.currentMethod}.${key}`;

    return `*.${key}`;
  }

  // ----------------------------------
  //            utils
  // ----------------------------------

  private singularize(str: string) {
    return pluralize(str, 1);
  }

  private camelCaseToSpaced(str: string) {
    return str.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  }

  private alphabetizeResources(obj: { [key: string]: any }) {
    const sorted: { [key: string]: any } = {};

    Object.keys(obj)
      .sort()
      .forEach((key) => {
        sorted[key] = obj[key];
      });

    return sorted;
  }

  private alphabetizeOperations(operations: Operation[]) {
    return operations
      .map((o) => o.operationId)
      .sort()
      .map((id) =>
        this.safeFind(operations, (o: Operation) => o.operationId === id)
      );
  }

  private safeFind<T>(arg: T[], cb: (arg: T) => boolean): T {
    const found = arg.find(cb);

    if (found === undefined || found === null) {
      throw new Error("Expected value is missing");
    }

    return found;
  }

  private getFallbackId(requestMethod: string) {
    const hasBracket = this.currentEndpoint.split("").includes("}");

    if (requestMethod === "get" && hasBracket) return "get";
    if (requestMethod === "get" && !hasBracket) return "getAll";
    if (requestMethod === "put") return "update";
    if (requestMethod === "delete") return "delete";
    if (requestMethod === "post") return "create";

    return "UNNAMED";
  }
}
