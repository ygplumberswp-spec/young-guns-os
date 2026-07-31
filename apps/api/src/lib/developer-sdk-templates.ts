import type { DeveloperSdkLanguage } from '@titan/shared';

export function generateSdkExampleCode(language: DeveloperSdkLanguage, baseUrl: string): string {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return `import { TitanClient } from '@titan/sdk';

const client = new TitanClient({
  baseUrl: '${baseUrl}',
  apiKey: process.env.TITAN_API_KEY,
});

const customers = await client.crm.listCustomers();
console.log(customers);`;
    case 'nodejs':
      return `const { TitanClient } = require('@titan/sdk');

const client = new TitanClient({
  baseUrl: '${baseUrl}',
  apiKey: process.env.TITAN_API_KEY,
});

client.crm.listCustomers().then(console.log).catch(console.error);`;
    case 'python':
      return `from titan_sdk import TitanClient

client = TitanClient(
    base_url="${baseUrl}",
    api_key=os.environ["TITAN_API_KEY"],
)

customers = client.crm.list_customers()
print(customers)`;
    case 'csharp':
      return `using Titan.Sdk;

var client = new TitanClient("${baseUrl}", Environment.GetEnvironmentVariable("TITAN_API_KEY"));
var customers = await client.Crm.ListCustomersAsync();
Console.WriteLine(customers);`;
    case 'java':
      return `TitanClient client = new TitanClient("${baseUrl}", System.getenv("TITAN_API_KEY"));
List<Customer> customers = client.crm().listCustomers();
System.out.println(customers);`;
    case 'go':
      return `client := titansdk.NewClient("${baseUrl}", os.Getenv("TITAN_API_KEY"))
customers, err := client.CRM.ListCustomers(ctx)
if err != nil { log.Fatal(err) }
fmt.Println(customers)`;
    default:
      return `// TITAN SDK example for ${language}`;
  }
}

export function getSdkPackageName(language: DeveloperSdkLanguage): string {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'nodejs':
      return '@titan/sdk';
    case 'python':
      return 'titan-sdk';
    case 'csharp':
      return 'Titan.Sdk';
    case 'java':
      return 'com.titan.sdk';
    case 'go':
      return 'github.com/titanbusinessos/titan-sdk-go';
    default:
      return 'titan-sdk';
  }
}

export function buildSdkManifest(language: DeveloperSdkLanguage, version: string) {
  return {
    language,
    version,
    features: [
      'authentication',
      'pagination',
      'webhooks',
      'error_handling',
      'rate_limiting',
      'retry_logic',
    ],
    authentication: ['api_key', 'bearer_token', 'personal_access_token'],
    pagination: { style: 'cursor', defaultPageSize: 25, maxPageSize: 100 },
    webhooks: { signatureHeader: 'X-Titan-Signature', retryPolicy: 'exponential_backoff' },
    errorHandling: { codes: [400, 401, 403, 404, 429, 500] },
    rateLimiting: { defaultQuotaPerMinute: 120, headerPrefix: 'X-RateLimit-' },
    retryLogic: { maxRetries: 3, backoffMs: [250, 500, 1000] },
  };
}
