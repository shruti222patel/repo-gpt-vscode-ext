import sys
from repo_gpt.openai_service import OpenAIService
from repo_gpt.search_service import SearchService

if len(sys.argv) != 4:
    print("Usage: python script_name.py <API_KEY> <LANGUAGE> <FILE_PATH>")
    sys.exit(1)

api_key = sys.argv[1]
language = sys.argv[2]
file_path = sys.argv[3]

openai_service = OpenAIService(api_key)
search_service = SearchService(openai_service, language=language)
search_service.analyze_file(file_path)
