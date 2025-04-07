import boto3

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='eu-north-1')

# Create table in your AWS account
table = dynamodb.create_table(
    TableName='Chat',
    KeySchema=[
        {'AttributeName': 'ChatID', 'KeyType': 'HASH'},  # Partition key
        {'AttributeName': 'Timestamp', 'KeyType' : 'RANGE'}
    ],
    AttributeDefinitions=[
        {'AttributeName': 'ChatID', 'AttributeType': 'S'},
        {'AttributeName': 'Timestamp', 'AttributeType': 'S'},
    ],
    ProvisionedThroughput={
        'ReadCapacityUnits': 5,
        'WriteCapacityUnits': 5
    }
)

table.meta.client.get_waiter('table_exists').wait(TableName='Chat')
print(f"Table {table.table_name} created successfully!")
