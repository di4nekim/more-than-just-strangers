import boto3
from botocore.exceptions import ClientError
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv('.env.local')

# Initialize DynamoDB resource with region from environment variable
dynamodb = boto3.resource('dynamodb', region_name=os.getenv('AWS_REGION'))
TABLE_NAME = "UserMetadata"

try:
    # Create table in your AWS account
    table = dynamodb.create_table(
        TableName=TABLE_NAME,
        KeySchema=[
            {'AttributeName': 'UserID', 'KeyType': 'HASH'},  # Partition key
        ],
        AttributeDefinitions=[
            {'AttributeName': 'UserID', 'AttributeType': 'S'},
        ],
        ProvisionedThroughput={
            'ReadCapacityUnits': 5,
            'WriteCapacityUnits': 5
        }
    )
    # wait until table exists before enabling TTL
    table.meta.client.get_waiter('table_exists').wait(TableName=TABLE_NAME)
except ClientError as e:
    if e.response['Error']['Code'] == 'ResourceInUseException':
        print("Table already exists!")
    else:
        print("Unexpected error:", e)

table = dynamodb.Table(TABLE_NAME)

# enable TTL
try:
    table.meta.client.update_time_to_live(
    TableName='UserMetadata',
    TimeToLiveSpecification={
        'Enabled' : True,
        'AttributeName' : 'TTL'
    }
    )
    print("TTL enabled!")
except ClientError as e:
    print("Error enabling TTL:", e)