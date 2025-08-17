from .config import dynamodb, TABLE_CONFIGS
from .utils import create_table_if_not_exists, enable_ttl

UserTable = create_table_if_not_exists(TABLE_CONFIGS['USER_METADATA'])
enable_ttl(TABLE_CONFIGS['USER_METADATA']['name'])