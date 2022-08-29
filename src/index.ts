import type {
  Plugin,
  PluginAPI,
  RPCResponse,
  RPCRequest,
} from "@lumeweb/relay-types";
import minimatch from "minimatch";
// @ts-ignore
import { default as HTTPClientImport } from "algosdk/dist/cjs/src/client/client.js";

const { default: HTTPClient } = HTTPClientImport;

const allowedEndpoints: { [endpoint: string]: ("GET" | "POST")[] } = {
  "/v2/teal/compile": ["POST"],
  "/v2/accounts/*": ["GET"],
};

export function proxyRestMethod(
  pluginApi: PluginAPI,
  apiServer: string
): Function {
  return async function (request: RPCRequest) {
    let method = request.data.method ?? false;
    let endpoint = request.data.endpoint ?? false;
    let data = request.data.data ?? false;
    let query = request.data.query ?? false;
    let fullHeaders = request.data.fullHeaders ?? {};

    fullHeaders = { ...fullHeaders, Referer: "lumeweb_relay" };

    if (method) {
      method = method.toUpperCase();
    }

    if (!endpoint) {
      throw new Error("Endpoint Missing");
    }

    let found = false;

    for (const theEndpoint in allowedEndpoints) {
      if (minimatch(endpoint, theEndpoint)) {
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error("ENDPOINT_INVALID");
    }

    const client = new HTTPClient({}, apiServer);
    let resp;
    switch (method) {
      case "GET":
        resp = await client.get(endpoint, query, fullHeaders);
        break;
      case "POST":
        if (Array.isArray(data?.data)) {
          data = new Uint8Array(Buffer.from(data.data));
        }

        resp = await client.post(endpoint, data, { ...fullHeaders });
        break;
      default:
        throw new Error("ERR_METHOD_INVALID");
    }

    const getCircularReplacer = () => {
      const seen = new WeakSet();
      return (key: string, value: any): any => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return;
          }
          seen.add(value);
        }
        return value;
      };
    };

    return JSON.parse(JSON.stringify(resp?.body, getCircularReplacer()));
  };
}

const plugin: Plugin = {
  name: "algorand",
  async plugin(api: PluginAPI): Promise<void> {
    const rest_request = proxyRestMethod(
      api,
      "http://mainnet-api.algonode.network"
    );
    const indexer_request = proxyRestMethod(
      api,
      "http://mainnet-idx.algonode.network"
    );
    api.registerMethod("rest_request", {
      cacheable: true,
      async handler(request: RPCRequest): Promise<RPCResponse | null> {
        let resp = await rest_request(request);
        if ("current-round" in resp) {
          resp["current-round"] = 0;
        }

        return { data: resp };
      },
    });
    api.registerMethod("indexer_request", {
      cacheable: true,
      async handler(request: RPCRequest): Promise<RPCResponse | null> {
        let resp = await indexer_request(request);

        return { data: resp };
      },
    });
  },
};

export default plugin;
