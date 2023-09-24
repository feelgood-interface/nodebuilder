import { camelCase, capitalCase } from "change-case";
import { Helper } from "../TemplateHelper";

export default class ResourceBuilder {
  lines: string[] = [];

  public operationsOptions(operations: Operation[]) {
    operations.sort((a, b) => a.operationId.localeCompare(b.operationId));

    operations.forEach(({ operationId, description, summary }, index) => {
      this.createLine("{", { tabs: !index ? 0 : 3 });

      this.createLine(`name: '${capitalCase(operationId)}',`, { tabs: 4 });
      this.createLine(`value: '${camelCase(operationId)}',`, { tabs: 4 });
      if (description) {
        this.createLine(`description: '${description}',`, { tabs: 4 });
      }
      if (summary) {
        this.createLine(`action: '${summary}',`, { tabs: 4 });
      }

      this.createLine("},", { tabs: 3 });
    });

    return this.lines.join("\n");
  }

  private createLine(line: string, { tabs } = { tabs: 0 }) {
    if (!tabs) {
      this.lines.push(line);
      return;
    }

    this.lines.push("\t".repeat(tabs) + line);
  }

  public getAllAdditions(resourceName: string, operationId: string) {
    return [
      this.returnAll(resourceName, operationId),
      this.limit(resourceName, operationId),
    ].join("\n\t");
  }

  public generateFields(key: string, schema: any): string {
    const helper = new Helper();
    const lines = ["{"];
    if (schema.type === "object" && schema.properties) {
      lines.push(`displayName: '${helper.titleCase(key)}',`);
      lines.push(`name: '${key}',`);
      lines.push(`placeholder: 'Add ${helper.titleCase(key)} Field',`);
      lines.push("type: 'fixedCollection',");
      lines.push("default: {},");
      if (schema.description) {
        lines.push(`description: '${schema.description}',`);
      }
      lines.push("options: [{");
      lines.push(`displayName: '${helper.titleCase(key)} Fields',`);
      lines.push(`name: '${helper.addFieldsSuffix(key)}',`);
      lines.push("values: [");
      Object.entries(schema.properties).forEach(([subKey, subValue]) => {
        lines.push(this.generateFields(subKey, subValue));
      });
      lines.push("]}],");
    } else {
      lines.push(`displayName: '${helper.titleCase(key)}',`);
      lines.push(`name: '${key}',`);
      lines.push(
        `type: '${helper.adjustType(
          schema.type,
          key,
          schema.items,
          schema.properties
        )}',`
      );
      if (helper.hasMinMax(schema) || schema.type === "array") {
        lines.push("typeOptions: {");
        if (helper.hasMinMax(schema) || schema.type === "array") {
          lines.push(`minValue: ${schema.minimum},`);
          lines.push(`maxValue: ${schema.maximum},`);
        }
        if (schema.type === "array") {
          lines.push("multipleValues: true,");
        }
        lines.push("},");
      }
      lines.push(`default: ${helper.getDefault(schema)},`);
      if (schema.description) {
        lines.push(`description: '${schema.description}',`);
      }
    }
    lines.push("},");

    return lines.join("\n");
  }

  private returnAll(resourceName: string, operationId: string) {
    const returnAll = `
    {
      displayName: 'Return All',
      name: 'returnAll',
      type: 'boolean',
      default: false,
      description: 'Whether to return all results or only up to a given limit',
      displayOptions: {
        show: {
          resource: [
            '${resourceName}',
          ],
          operation: [
            '${operationId}',
          ],
        },
      },
    },
    `;

    return this.adjustCodeToTemplate(returnAll);
  }

  private limit(resourceName: string, operationId: string) {
    const limit = `
    {
      displayName: 'Limit',
      name: 'limit',
      type: 'number',
      default: 50,
      description: 'Max number of results to return',
      typeOptions: {
        minValue: 1,
      },
      displayOptions: {
        show: {
          resource: [
            '${resourceName}',
          ],
          operation: [
            '${operationId}',
          ],
          returnAll: [
            false,
          ],
        },
      },
    },
    `;

    return this.adjustCodeToTemplate(limit);
  }

  private adjustCodeToTemplate(property: string) {
    return property
      .trimLeft()
      .replace(/^[ ]{2}/gm, "")
      .replace(/[ ]{2}/gm, "\t")
      .trimRight();
  }

  private hasMinMax = (arg: any) => arg.minimum && arg.maximum;
}
