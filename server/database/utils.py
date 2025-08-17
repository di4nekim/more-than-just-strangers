from botocore.exceptions import ClientError
from .config import dynamodb, DEFAULT_THROUGHPUT

def create_table_if_not_exists(table_config):
    """Create a DynamoDB table if it doesn't exist."""
    try:
        table = dynamodb.create_table(
            TableName=table_config['name'],
            KeySchema=table_config['key_schema'],
            AttributeDefinitions=table_config['attribute_definitions'],
            ProvisionedThroughput=DEFAULT_THROUGHPUT
        )
        table.meta.client.get_waiter('table_exists').wait(TableName=table_config['name'])
        return table
    except ClientError as e:
        if e.response['Error']['Code'] != 'ResourceInUseException':
            raise
        return dynamodb.Table(table_config['name'])

def enable_ttl(table_name, ttl_attribute='TTL'):
    """Enable TTL on a DynamoDB table."""
    try:
        dynamodb.meta.client.update_time_to_live(
            TableName=table_name,
            TimeToLiveSpecification={
                'Enabled': True,
                'AttributeName': ttl_attribute
            }
        )
    except ClientError:
        pass
