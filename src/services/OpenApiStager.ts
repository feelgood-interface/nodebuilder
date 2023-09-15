import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { JSONPath as jsonQuery } from "jsonpath-plus";
import { titleCase } from "title-case";
import { camelCase } from "change-case";
import pluralize from "pluralize";
import { inputDir, openApiInputDir, swagger } from "../config";

export default class OpenApiStager {
  private readonly json: JsonObject & { paths: object };
  private readonly serviceName: string;
  private currentEndpoint: string;
  private currentResource: string;

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

  private escape(description: string) {
    return description
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .replace(/'/g, "\\'")
      .trim();
  }

  private processRequestBody() {
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

    return [{ name: "Standard", ...requestBody } as const];
  }

  private setTextPlainProperty(requestBody: OperationRequestBody) {
    requestBody.textPlainProperty = requestBody.description
      ?.split(" ")[0]
      .toLowerCase();
  }

  private sanitizeProperties(urlEncoded: { schema: RequestBodySchema }) {
    const properties = Object.keys(urlEncoded.schema.properties);
    properties.forEach((property) => {
      const sanitizedProperty = camelCase(property.replace(".", " "));

      if (sanitizedProperty !== property) {
        urlEncoded.schema.properties[sanitizedProperty] =
          urlEncoded.schema.properties[property];
        delete urlEncoded.schema.properties[property];
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

    if (parameters.length) operation.parameters = parameters;
    if (requestBody?.length) operation.requestBody = requestBody;
    if (description) operation.description = description;

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

    if (extracted.startsWith("edit")) return "update";

    if (extracted.startsWith("add")) return "create";

    const surplusPart = this.currentResource.replace(" ", "");
    const surplusRegex = new RegExp(surplusPart, "g");

    return extracted.replace(surplusRegex, "");
  }

  private processParameters() {
    const parameters = this.extract("parameters");

    parameters.forEach((param) => {
      if (param.description) {
        param.description = this.escape(param.description);
      }

      // TODO: Type properly
      // @ts-ignore
      if ("oneOf" in param.schema && param.schema.oneOf) {
        // @ts-ignore
        param.schema = param.schema.oneOf[0];
      }

      // TODO: Type properly
      // @ts-ignore
      if ("anyOf" in param.schema && param.schema.anyOf) {
        // @ts-ignore
        param.schema = param.schema.anyOf[0];
      }
    });

    return parameters.map((field) =>
      field.required ? field : { ...field, required: false }
    );
  }

  // ----------------------------------
  //            extractors
  // ----------------------------------

  /**Extract the keys and values from the OpenAPI JSON based on the current endpoint.
   * Based on [JSON Path Plus](https://github.com/JSONPath-Plus/JSONPath).
   *
   * Note: The square brackets escape chars in the endpoint.*/
  private extract(key: "description" | "operationId"): string | undefined;
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
      (key === "requestBody" && result.length);

    if (hasExtraNesting) return result[0];

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
