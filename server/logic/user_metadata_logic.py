import boto3
import time

# (1) fetch user data from AWS cognito, using the Admin API

cognito_client = boto3.client('cognito-idp')
USER_POOL_ID = 'eu-north-1'

# fetching users from Cognito


def get_all_users():
    users = []
    response = cognito_client.list_users(UserPoolId=USER_POOL_ID)

    for user in response['Users']:
        user_data = {
            "sub": next(attr["Value"] for attr in user["Attributes"] if attr["Name"] == "sub"),
            "name": next((attr["Value"] for attr in user["Attributes"] if attr["Name"] == "name"), "Unknown"),
            "email": next((attr["Value"] for attr in user["Attributes"] if attr["Name"] == "email"), "No Email")
        }
        users.append(user_data)

    return users


# fetch users from Cognito
cognito_users = get_all_users()
print(cognito_users)

# (2) store Cognito users in dynamoDB –– batch insert
dynamodb = boto3.client('dynamodb')

DYNAMODB_TABLE = "UserMetaData"


def store_users_in_dynamodb(users):
    for user in users:
        dynamodb.put_item(
            TableName=DYNAMODB_TABLE,
            Item={
                "PK": {"S": user["sub"]},
                "Name": {"S": user["name"]},
                "Email": {"S": user["email"]},
                "IsOnline": {"BOOL": False},
                "LastActive": {"S": "Never"},
                "IsTyping": {"BOOL": False},
                "OnlineStatus": {"S": "Offline"},
                "CurrChatPartnerID": {"S": ""},
                # Set TTL to 1 hour from now
                "TTL": {"N": str(int(time.time()) + 3600)}
            }
        )


store_users_in_dynamodb(cognito_users)
print("Users successfully added!")
