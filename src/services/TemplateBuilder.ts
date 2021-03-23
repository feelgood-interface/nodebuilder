import { camelCase } from "change-case";
import { ApiCallBuilder } from "./templating/ApiCallBuilder";
import { DividerBuilder } from "./templating/DividerBuilder";
import { BranchBuilder } from "./templating/BranchBuilder";
import { ImportsBuilder } from "./templating/ImportsBuilder";

export class Builder {
  resourceTuples: ResourceTuples;
  resourceNames: string[];
  serviceApiRequest: string;

  apiCallBuilder: ApiCallBuilder;
  dividerBuilder: DividerBuilder;
  branchBuilder: BranchBuilder;
  importsBuilder: ImportsBuilder;

  constructor(mainParams: MainParams, { serviceName }: MetaParams) {
    this.resourceTuples = Object.entries(mainParams);
    this.resourceNames = Object.keys(mainParams);
    this.serviceApiRequest = camelCase(serviceName) + "ApiRequest";

    this.apiCallBuilder = new ApiCallBuilder(this.serviceApiRequest);
    this.importsBuilder = new ImportsBuilder(
      this.serviceApiRequest,
      mainParams
    );
    this.dividerBuilder = new DividerBuilder();
    this.branchBuilder = new BranchBuilder(mainParams);
  }

  // ApiCallBuilder ------------------

  apiCall(operation: Operation) {
    return this.apiCallBuilder.run(operation);
  }

  // GenericFunctionsImportsBuilder ---

  genericFunctionsImports() {
    return this.importsBuilder.genericFunctionsImports();
  }

  // DividerBuilder ------------------

  resourceDivider(resourceName: string) {
    return this.dividerBuilder.resourceDivider(resourceName);
  }

  operationDivider(
    resourceName: string,
    operationId: string,
    operationUrl: string
  ) {
    return this.dividerBuilder.operationDivider(
      resourceName,
      operationId,
      operationUrl
    );
  }

  resourceDescriptionDivider(resourceName: string, operationId: string) {
    return this.dividerBuilder.resourceDescriptionDivider(
      resourceName,
      operationId
    );
  }

  // BranchBuilder ------------------

  resourceBranch(resourceName: string) {
    return this.branchBuilder.resourceBranch(resourceName);
  }

  operationBranch(resourceName: string, operation: Operation) {
    return this.branchBuilder.operationBranch(resourceName, operation);
  }

  resourceError(
    resourceName: string,
    options: { enabled: boolean } = { enabled: false }
  ) {
    return this.branchBuilder.resourceError(resourceName, options);
  }

  operationError(
    resourceName: string,
    operation: Operation,
    options: { enabled: boolean } = { enabled: false }
  ) {
    return this.branchBuilder.operationError(resourceName, operation, options);
  }
}
