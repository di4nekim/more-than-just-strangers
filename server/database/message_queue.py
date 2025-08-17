import uuid
import datetime
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Attr
from .config import dynamodb, TABLE_CONFIGS
from .utils import create_table_if_not_exists

MessageQueue = create_table_if_not_exists(TABLE_CONFIGS['MESSAGE_QUEUE'])

def add_message_to_queue(chatId, senderId, receiverId, message):
    try:
        response = MessageQueue.put_item(
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
        raise

def fetch_undelivered_messages(receiverId):
    try:
        response = MessageQueue.scan(
            FilterExpression=Attr('receiverId').eq(receiverId) & Attr('delivered').eq(False)
        )
        return response['Items']
    except ClientError as e:
        raise