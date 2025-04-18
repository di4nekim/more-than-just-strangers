import boto3
from botocore.exceptions import ClientError

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb', region_name='eu-north-1')
TABLE_NAME = "UserMetaData"

try:
    # Create table in your AWS account
    table = dynamodb.create_table(
        TableName='UserMetaData',
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
    table.meta.client.get_waiter('table_exists').wait(TableName='UserMetaData')
except ClientError as e:
    if e.response['Error']['Code'] == 'ResourceInUseException':
        print("Table already exists!")
    else:
        print("Unexpected error:", e)

table = dynamodb.Table(TABLE_NAME)

# enable TTL
try:
    table.meta.client.update_time_to_live(
    TableName='UserMetaData',
    TimeToLiveSpecification={
        'Enabled' : True,
        'AttributeName' : 'TTL'
    }
    )
    print("TTL enabled!")
except ClientError as e:
    print("Error enabling TTL:", e)