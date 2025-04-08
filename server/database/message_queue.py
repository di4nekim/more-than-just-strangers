import boto3
from botocore.exceptions import ClientError
import uuid
import datetime
from boto3.dynamodb.conditions import Attr

# Initialize a session using Amazon DynamoDB
session = boto3.Session(
    aws_access_key_id='YOUR_ACCESS_KEY',
    aws_secret_access_key='YOUR_SECRET_KEY',
    region_name='YOUR_REGION'
)

dynamodb = session.resource('dynamodb')

# Reference to the MessageQueue table
message_queue_table = dynamodb.Table('MessageQueue')

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