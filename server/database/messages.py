import boto3
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv('.env.local')

# Initialize DynamoDB resource with region from environment variable
dynamodb = boto3.resource('dynamodb', region_name=os.getenv('AWS_REGION'))

# Create table in your AWS account
table = dynamodb.create_table(
    TableName='Messages',
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

table.meta.client.get_waiter('table_exists').wait(TableName='Messages')
print(f"Table {table.table_name} created successfully!")
