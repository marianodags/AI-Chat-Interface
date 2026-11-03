import os
from dotenv import load_dotenv
load_dotenv()
FREELLMAPI_BASE_URL = os.getenv('FREELLMAPI_BASE_URL', 'http://127.0.0.1:31415/v1').rstrip('/')
FREELLMAPI_API_KEY = os.getenv('FREELLMAPI_API_KEY', '')
FREELLMAPI_MODEL = os.getenv('FREELLMAPI_MODEL', 'auto')
SECRET_KEY = os.getenv('SECRET_KEY', 'local-development-only')
