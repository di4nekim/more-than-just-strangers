import boto3
from botocore.exceptions import ClientError
import uuid
import datetime
from boto3.dynamodb.conditions import Attr
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv('.env.local')

# Initialize DynamoDB resource with region from environment variable
dynamodb = boto3.resource('dynamodb', region_name=os.getenv('AWS_REGION'))
TABLE_NAME = "MessageQueue"

try:
    # Create MessageQueue table if it doesn't exist
    table = dynamodb.create_table(
        TableName=TABLE_NAME,
        KeySchema=[
            {'AttributeName': 'messageId', 'KeyType': 'HASH'},
        ],
        AttributeDefinitions=[
            {'AttributeName': 'messageId', 'AttributeType': 'S'},
        ],
        ProvisionedThroughput={
            'ReadCapacityUnits': 5,
            'WriteCapacityUnits': 5
        }
    )
    # wait until table exists before proceeding
    table.meta.client.get_waiter('table_exists').wait(TableName=TABLE_NAME)
    print(f"Table {table.table_name} created successfully!")
except ClientError as e:
    if e.response['Error']['Code'] == 'ResourceInUseException':
        print("Table already exists!")
    else:
        print("Unexpected error:", e)

# Reference to the MessageQueue table
message_queue_table = dynamodb.Table(TABLE_NAME)

# Function to add a message to the queue
def add_message_to_queue(chatId, senderId, receiverId, message):
    try:
        response = message_queue_table.put_item(
            Item={
                'messageId': str(uuid.uuid4()),
                'chatId': chatId,
                'senderId': senderId,
                'receiverId': receiverId,
                'message': message,
                'timestamp': datetime.datetime.utcnow().isoformat(),
                'delivered': False
            }
        )
        return response
    except ClientError as e:
        print(e.response['Error']['Message'])

# Function to fetch undelivered messages for a user
def fetch_undelivered_messages(receiverId):
    try:
        response = message_queue_table.scan(
            FilterExpression=Attr('receiverId').eq(receiverId) & Attr('delivered').eq(False)
        )
        return response['Items']
    except ClientError as e:
        print(e.response['Error']['Message']) 