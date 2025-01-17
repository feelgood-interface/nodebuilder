import { snakeCase } from 'change-case';

/**
 * Responsible for staging traversed params into nodegen params.
 * Staging params are for consumption by nodegen templates.
 */
export default class CustomSpecStager {
	private inputMainParams: CustomSpecParams['mainParams'];
	private outputMetaParams: MetaParams;
	private outputMainParams: MainParams = {};

	private outputOperation: Operation;
	private currentResource = '';

	constructor(yamlNodegenParams: any) {
		this.inputMainParams = yamlNodegenParams.mainParams;
		this.outputMetaParams = yamlNodegenParams.metaParams;
	}

	public run(): NodegenParams {
		this.initializeMainParams();

		this.loopOverInputOperations((inputOperation) => {
			// this.validateInputOperation(inputOperation);
			this.initializeOutputOperation(inputOperation);
			this.populateOutputOperation(inputOperation);
		});

		this.unescapeNodeColorHash();

		return {
			mainParams: this.outputMainParams,
			metaParams: this.outputMetaParams,
		};
	}

	// ----------------------------------
	//            validators
	// ----------------------------------

	validateInputOperation(operation: CustomSpecOperation) {
		const errors = [];

		// TODO: Rethink this check
		// if (operation.requestMethod === "POST" && !operation.requiredFields) {
		//   const invalidOperation = JSON.stringify(operation, null, 2);
		//   errors.push(
		//     `POST request is missing required request body params:\n${invalidOperation}`
		//   );
		// }

		if (this.needsRouteParam(operation) && !operation.endpoint.includes('{')) {
			const invalidOperation = JSON.stringify(operation, null, 2);
			errors.push(`Operation is missing required route param:\n${invalidOperation}`);
		}

		if (errors.length) {
			throw new Error(`Validation failed:\n${errors}`);
		}
	}

	// ----------------------------------
	//    initializers and populators
	// ----------------------------------

	private initializeMainParams() {
		this.getResources().forEach((resource) => {
			this.outputMainParams[resource] = [];
		});
	}

	private initializeOutputOperation({
		endpoint,
		requestMethod,
		operationId,
		operationUrl,
	}: CustomSpecOperation) {
		this.outputOperation = {
			endpoint,
			requestMethod,
			operationId,
		};

		this.outputOperation.description = this.getOperationDescription();

		if (operationUrl) this.outputOperation.operationUrl = operationUrl;
	}

	private getOperationDescription() {
		const { operationId } = this.outputOperation;

		let adjustedResource = this.handleMultipleWords(this.currentResource);

		if (operationId === 'getAll') return `Retrieve all ${adjustedResource}s`;

		const addArticle = (resource: string) =>
			'aeiou'.split('').includes(this.currentResource.charAt(0))
				? `an ${resource}`
				: `a ${resource}`;

		const capitalize = (resource: string) => resource.charAt(0).toUpperCase() + resource.slice(1);

		let adjustedCurrentResource = addArticle(adjustedResource);

		return `${capitalize(operationId)} ${adjustedCurrentResource}`;
	}

	private loopOverInputOperations(callback: (inputOperation: CustomSpecOperation) => void) {
		this.getResources().forEach((resource) => {
			this.currentResource = resource;
			this.inputMainParams[resource].forEach(callback);
		});
	}

	private populateOutputOperation(inputOperation: CustomSpecOperation) {
		const { requiredFields, additionalFields, filters, updateFields } = inputOperation;

		// path params

		const outputPathParams = this.handlePathParams(inputOperation);

		if (outputPathParams) this.outputOperation.parameters = outputPathParams;

		// qs params (required)

		const outputQsParams = this.handleRequiredQsParams(requiredFields?.queryString, {
			required: true,
		});

		if (outputQsParams) this.outputOperation.parameters = outputQsParams;

		// qs params (extra) - additional fields

		const outputQsAddFields = this.stageQsExtraFields(additionalFields, {
			name: 'Additional Fields',
		});

		if (outputQsAddFields) this.outputOperation.additionalFields = outputQsAddFields;

		// qs params (extra) - filters

		const outputQsFilters = this.stageQsExtraFields(filters, {
			name: 'Filters',
		});

		if (this.outputOperation.parameters && outputQsFilters)
			this.outputOperation.parameters.push(...outputQsFilters.options);

		if (!this.outputOperation.parameters && outputQsFilters)
			this.outputOperation.parameters = outputQsFilters.options;

		// qs params (extra) - update fields

		const outputQsUpdateFields = this.stageQsExtraFields(updateFields, {
			name: 'Update Fields',
		});

		if (outputQsUpdateFields) this.outputOperation.updateFields = outputQsUpdateFields;

		// required body (required)

		const outputRequestBody = this.stageRequestBody(requiredFields?.requestBody, {
			required: true,
			name: 'Standard',
		});

		this.outputOperation.requestBody = outputRequestBody ?? [];

		// required body (extra)

		this.handleRequestBodyExtraFields(additionalFields, {
			name: 'Additional Fields',
		});
		this.handleRequestBodyExtraFields(filters, { name: 'Filters' });
		this.handleRequestBodyExtraFields(updateFields, { name: 'Update Fields' });

		this.outputMainParams[this.currentResource].push(this.outputOperation);
	}

	// ----------------------------------
	//            handlers
	// ----------------------------------

	/**
	 * Handle path params (if any) by forwarding them for staging.
	 */
	private handlePathParams(inputOperation: CustomSpecOperation) {
		if (!inputOperation.endpoint.match(/\{/)) return null;

		const pathParams = inputOperation.endpoint.match(/(?<={)(.*?)(?=})/g);

		if (!pathParams) return null;

		return pathParams.map((pathParam) => this.stagePathParam(pathParam, inputOperation));
	}

	/**
	 * Handle required query string params (if any) by forwarding them for staging.
	 */
	private handleRequiredQsParams(
		queryString: CustomSpecFieldContent | undefined,
		{ required }: { required: true },
	) {
		if (!queryString) return null;

		return Object.entries(queryString).map(([key, value]) =>
			this.stageQsParam(key, value, { required }),
		);
	}

	/**
	 * Handle extra fields in request body (if any) by forwarding them for staging.
	 */
	private handleRequestBodyExtraFields(
		extraFields: CustomSpecFields | undefined,
		{
			name,
		}: {
			name: 'Additional Fields' | 'Filters' | 'Update Fields';
		},
	) {
		const rbExtraFields = this.stageRequestBody(extraFields?.requestBody, {
			required: false,
			name,
		});

		if (rbExtraFields && this.outputOperation.requestBody) {
			this.outputOperation.requestBody.push(...rbExtraFields);
		}
	}

	// ----------------------------------
	//            stagers
	// ----------------------------------

	private stagePathParam(pathParam: string, { operationId }: CustomSpecOperation) {
		const output: OperationParameter = {
			in: 'path' as const,
			name: pathParam,
			schema: {
				type: 'string',
				default: '',
			},
			required: true,
		};

		let description = `ID of the ${this.handleMultipleWords(this.currentResource)} to `;

		if (operationId === 'create' || operationId === 'update' || operationId === 'delete') {
			output.description = description + operationId;
		} else if (operationId === 'get') {
			output.description = description + 'retrieve';
		}

		return output;
	}

	private stageQsExtraFields(
		extraFields: CustomSpecFields | undefined,
		{ name }: { name: ExtraFieldName },
	) {
		if (!extraFields) return null;

		const qsExtraFields = extraFields.queryString;

		if (!qsExtraFields) return null;

		const output: AdditionalFields = {
			name,
			type: 'collection',
			description: '',
			default: {},
			options: [],
		};

		Object.entries(qsExtraFields).forEach(([key, value]) =>
			output.options.push(this.stageQsParam(key, value, { required: false })),
		);

		return output.options.length ? output : null;
	}

	private stageQsParam(key: string, value: ParamContent, { required }: { required: boolean }) {
		const output: OperationParameter = {
			in: 'query' as const,
			name: key,
			required,
			schema: {
				type: value.type,
				default: value.default,
			},
		};

		if (value.type === 'options' && value.options) {
			output.schema.options = value.options;
		}

		if (value.description) {
			output.description = this.supplementLink(value.description);
		}

		return output;
	}

	public stageRequestBody(
		requestBody: CustomSpecFieldContent | undefined,
		{
			required,
			name,
		}: {
			required: boolean;
			name: 'Standard' | ExtraFieldName;
		},
	) {
		if (!requestBody) return null;

		const outputRequestBody: OperationRequestBody = {
			name,
			required,
			content: {
				// TODO: add `multipart/form-data` and `text/plain`
				'application/x-www-form-urlencoded': {
					schema: {
						type: 'object',
						properties: {},
					},
				},
			},
		};

		const formUrlEncoded = 'application/x-www-form-urlencoded';

		Object.entries(requestBody).forEach(([key, value]) => {
			const properties = outputRequestBody.content[formUrlEncoded]?.schema.properties;

			if (value.description) value.description = this.supplementLink(value.description);

			if (properties) {
				properties[key] = value;
			}
		});

		outputRequestBody.content[formUrlEncoded]!.schema.properties = this.sortObject(
			outputRequestBody.content[formUrlEncoded]?.schema.properties,
		);

		return [outputRequestBody];
	}

	// ----------------------------------
	//            utils
	// ----------------------------------

	private handleMultipleWords(resource: string) {
		return snakeCase(resource).includes('_') ? snakeCase(resource).replace(/_/g, ' ') : resource;
	}

	/**
	 * TODO: Type properly
	 */
	private sortObject(obj: { [key: string]: any } | undefined) {
		if (!obj) return;

		return Object.keys(obj)
			.sort()
			.reduce<any>((result, key) => {
				result[key] = obj[key];
				return result;
			}, {});
	}

	/**
	 * Remove `\` from `#` in the node color in the meta params in the YAML file.
	 */
	private unescapeNodeColorHash() {
		this.outputMetaParams.nodeColor = this.outputMetaParams.nodeColor.replace('\\#', '#');
	}

	/**
	 * Return all the resource names of the API.
	 */
	private getResources() {
		return Object.keys(this.inputMainParams);
	}

	/**
	 * Add `target="_blank"` to any link in a param description.
	 */
	private supplementLink(description: string) {
		if (description.includes('<a href=')) {
			return description.replace('">', '" target="_blank">');
		}

		return description;
	}

	private needsRouteParam(operation: CustomSpecOperation) {
		return (
			(operation.requestMethod === 'GET' && operation.operationId !== 'getAll') ||
			operation.requestMethod === 'DELETE' ||
			operation.requestMethod === 'PATCH'
		);
	}
}
