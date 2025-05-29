const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand,
} = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({
  region: "us-west-2",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "fakeMyKeyId",
    secretAccessKey: "fakeSecretAccessKey",
  },
});

async function ensureTableExists(params) {
  const tableName = params.TableName;
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`Table already exists: ${tableName}`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      console.log(`Creating table: ${tableName}`);
      await client.send(new CreateTableCommand(params));
    } else {
      console.error(`Error checking table ${tableName}:`, err);
    }
  }
}

// async function seedItemIfNotExists(tableName, item) {
//   try {
//     await client.send(new PutItemCommand({
//       TableName: tableName,
//       Item: item,
//       ConditionExpression: "attribute_not_exists(PK)",
//     }));
//     console.log(`Seeded item into ${tableName}`);
//   } catch (err) {
//     if (err.name === "ConditionalCheckFailedException") {
//       console.log(`Item already exists in ${tableName}, skipping.`);
//     } else {
//       console.error(`Error seeding item into ${tableName}:`, err);
//     }
//   }
// }

async function bootstrap() {
  await ensureTableExists({
    TableName: "UserMetadata",
    AttributeDefinitions: [{ AttributeName: "PK", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  });

  await ensureTableExists({
    TableName: "Messages",
    AttributeDefinitions: [
      { AttributeName: "PK", AttributeType: "S" },
      { AttributeName: "SK", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "PK", KeyType: "HASH" },
      { AttributeName: "SK", KeyType: "RANGE" },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  });

  await ensureTableExists({
    TableName: "Conversations",
    AttributeDefinitions: [{ AttributeName: "PK", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  });

  console.log("Bootstrap complete.");
}

bootstrap();
