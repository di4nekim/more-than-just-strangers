import boto3

# Initialize a session using Amazon DynamoDB
dynamodb = boto3.resource('dynamodb', region_name='eu-north-1')

# Create the DynamoDB table
table = dynamodb.create_table(
    TableName='Connections',
    KeySchema=[
        {
            'AttributeName': 'connectionId',
            'KeyType': 'HASH'  # Partition key
        }
    ],
    AttributeDefinitions=[
        {
            'AttributeName': 'connectionId',
            'AttributeType': 'S'  # String
        }
    ],
    ProvisionedThroughput={
        'ReadCapacityUnits': 5,
        'WriteCapacityUnits': 5
    }
)

# Wait until the table exists
table.meta.client.get_waiter('table_exists').wait(TableName='Connections')

print("Table status:", table.table_status)
