import OpenApiParser from "../services/OpenApiParser";
import PackageJsonGenerator from "../services/PackageJsonGenerator";
import Generator from "../services/TypeScriptGenerator";
import YamlParser from "../services/YamlParser";
import YamlStager from "../services/YamlStager";
import YamlTraverser from "../services/YamlTraverser";
import FilePrinter from "../utils/FilePrinter";

// for quick testing only

const preTraversalParams = new YamlParser("elasticsearch.yaml").run();
const traversedParams = new YamlTraverser(preTraversalParams).run();
const stagedParamsFromYaml = new YamlStager(traversedParams).run();

const stagedParamsFromOpenApi = new OpenApiParser("lichess.json").run();

new FilePrinter(stagedParamsFromOpenApi).print({ format: "json" });
new Generator(stagedParamsFromOpenApi.mainParams).run();
new PackageJsonGenerator(stagedParamsFromOpenApi.metaParams).run();
