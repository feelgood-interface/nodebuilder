import { camelCase, capitalCase, pascalCase } from 'change-case';
import { titleCase } from 'title-case';

export class Helper {
	adjustType = (schema: any, name: string): string => {
		if (schema.type === 'integer') return 'number';
		if (schema.format === 'date-time' || name.includes('date')) return 'dateTime';
		if (schema.type === 'object' && schema.properties && name === 'query') {
			return 'collection';
		}
		if (schema.type === 'object' && schema.properties) return 'fixedCollection';
		if (schema.type === 'object' && !schema.properties) return 'json';
		if (schema.type === 'array' && schema.items?.type) {
			return this.adjustType(schema.items, name);
		}
		return schema.type;
	};

	camelCase = (str: string) => camelCase(str);

	capitalCase = (str: string) => capitalCase(str);

	escape = (str: string) => str.replace(/(\r)?\n/g, '<br>').replace(/'/g, '’');

	getCredentialsString = (name: string, auth: AuthType) =>
		this.camelCase(name) + (auth === 'OAuth2' ? 'OAuth2' : '') + 'Api';

	// TODO: use adjustType to get type
	getDefault(arg: any) {
		if (arg.default) {
			if (arg.type === 'boolean' || arg.type === 'number') return arg.default;

			if (arg.type === 'string' || arg.type === 'options') return `'${arg.default}'`;

			// edge case: number type with string default (third-party error)
			if (typeof arg.default === 'string' && (arg.type === 'number' || arg.type === 'integer')) {
				return 0;
			}
		}

		if (
			arg.type === 'string' ||
			arg.type === 'dateTime' ||
			arg.type === 'loadOptions' ||
			(arg.type === 'object' && !arg.properties)
		)
			return "''";
		if (arg.type === 'number' || arg.type === 'integer') return 0;
		if (arg.type === 'boolean') return false;
		if (arg.type === 'options') return `'${arg.options[0]}'`;
		if (arg.type === 'object') return '{}';
		if (arg.type === 'array') return '[]';

		return "''";
	}

	getParams = (params: OperationParameter[], type: 'query' | 'path') =>
		params.filter((p) => p.in === type).map((p) => p.name);

	hasMinMax = (arg: any) => arg.minimum && arg.maximum;

	pascalCase = (str: string) => pascalCase(str);

	titleCase = (str: string) => {
		if (typeof str !== 'string') {
			return (str as any).toString();
		}
		let base = str.replace(/[._]/g, ' ').trim();

		if (base.toUpperCase() === base) base = base.toLowerCase();

		// titleCase doesn't separate string
		base = capitalCase(base);

		return titleCase(base).replace('Id', 'ID');
	};

	toTemplateLiteral = (endpoint: string) => endpoint.replace(/{/g, '${');

	getPlaceholder = (property: string) => {
		if (property === 'Filters') return 'Add Filter';
		return 'Add Field';
	};

	addFieldsSuffix = (key: string) =>
		key.split('').includes('_') ? key + '_fields' : key + 'Fields';
}
