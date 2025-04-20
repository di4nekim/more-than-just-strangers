import boto3
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv('.env.local')

# Initialize DynamoDB resource with region from environment variable
dynamodb = boto3.resource('dynamodb', region_name=os.getenv('AWS_REGION'))

# Create the DynamoDB table
table = dynamodb.create_table(
    TableName='Connections',
    KeySchema=[
        {
            'AttributeName': 'ConnectionID',
            'KeyType': 'HASH'  # Partition key
        }
    ],
    AttributeDefinitions=[
        {
            'AttributeName': 'ConnectionID',
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

print(f"Table {table.table_name} created successfully!")
