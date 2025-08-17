import boto3
import os
from dotenv import load_dotenv

load_dotenv('.env.local')

dynamodb = boto3.resource('dynamodb', region_name=os.getenv('AWS_REGION'))

TABLE_CONFIGS = {
    'CONNECTIONS': {
        'name': os.getenv('CONNECTIONS_TABLE', 'Connections'),
        'key_schema': [{'AttributeName': 'ConnectionID', 'KeyType': 'HASH'}],
        'attribute_definitions': [{'AttributeName': 'ConnectionID', 'AttributeType': 'S'}]
    },
    'MESSAGES': {
        'name': os.getenv('MESSAGES_TABLE', 'Messages'),
        'key_schema': [
            {'AttributeName': 'ChatID', 'KeyType': 'HASH'},
            {'AttributeName': 'Timestamp', 'KeyType': 'RANGE'}
        ],
        'attribute_definitions': [
            {'AttributeName': 'ChatID', 'AttributeType': 'S'},
            {'AttributeName': 'Timestamp', 'AttributeType': 'S'}
        ]
    },
    'MESSAGE_QUEUE': {
        'name': os.getenv('MESSAGE_QUEUE_TABLE', 'MessageQueue'),
        'key_schema': [{'AttributeName': 'messageId', 'KeyType': 'HASH'}],
        'attribute_definitions': [{'AttributeName': 'messageId', 'AttributeType': 'S'}]
    },
    'USER_METADATA': {
        'name': os.getenv('USER_METADATA_TABLE', 'UserMetadata'),
        'key_schema': [{'AttributeName': 'userId', 'KeyType': 'HASH'}],
        'attribute_definitions': [{'AttributeName': 'userId', 'AttributeType': 'S'}]
    }
}

DEFAULT_THROUGHPUT = {
    'ReadCapacityUnits': 5,
    'WriteCapacityUnits': 5
}
