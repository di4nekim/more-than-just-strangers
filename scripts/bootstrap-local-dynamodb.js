const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand,
  DeleteTableCommand,
} = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({
  region: "us-west-2",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "fakeMyKeyId",
    secretAccessKey: "fakeSecretAccessKey",
  },
});

async function deleteTable(tableName) {
  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
    console.log(`Deleted table: ${tableName}`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      console.log(`Table ${tableName} does not exist, skipping deletion`);
    } else {
      console.error(`Error deleting table ${tableName}:`, err);
    }
  }
}

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
  // Delete existing tables first
  await deleteTable("UserMetadata");
  await deleteTable("Messages");
  await deleteTable("Conversations");

  // Wait a moment for tables to be fully deleted
  await new Promise(resolve => setTimeout(resolve, 1000));

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
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "timestamp", AttributeType: "S" }
    ],
    KeySchema: [
      { AttributeName: "PK", KeyType: "HASH" },
      { AttributeName: "SK", KeyType: "RANGE" }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "userIdTimestampIndex",
        KeySchema: [
          { AttributeName: "userId", KeyType: "HASH" },
          { AttributeName: "timestamp", KeyType: "RANGE" }
        ],
        Projection: {
          ProjectionType: "ALL"
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  });

  await ensureTableExists({
    TableName: "Conversations",
    AttributeDefinitions: [
      { AttributeName: "PK", AttributeType: "S" },
      { AttributeName: "GSI1_PK", AttributeType: "S" },
      { AttributeName: "GSI1_SK", AttributeType: "S" }
    ],
    KeySchema: [
      { AttributeName: "PK", KeyType: "HASH" }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "GSI1",
        KeySchema: [
          { AttributeName: "GSI1_PK", KeyType: "HASH" },
          { AttributeName: "GSI1_SK", KeyType: "RANGE" }
        ],
        Projection: {
          ProjectionType: "ALL"
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  });

  console.log("Bootstrap complete.");
}

bootstrap();
