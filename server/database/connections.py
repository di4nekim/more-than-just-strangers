from .config import dynamodb, TABLE_CONFIGS
from .utils import create_table_if_not_exists

ConnectionsTable = create_table_if_not_exists(TABLE_CONFIGS['CONNECTIONS'])