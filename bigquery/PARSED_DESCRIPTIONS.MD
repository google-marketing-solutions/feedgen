<!--
Copyright 2024 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# Parsing web shops for product descriptions

The following Bash/Python script fills the table `InputFilteredWeb` with product descriptions from the web. The line defining the variable "content" is key, as it needs to be adapted to where in the HTML the actual description can be found. It is a bad idea to simply get the whole page content, as that will dilute the content, may sabotage the prompt and ultimately lead to the maximal number of input tokens to be exceeded.

```bash
dataset="[👉DATASET]"
source_table="InputFiltered"
dest_table="InputFilteredWeb"

query="SELECT id, `👉web_url` FROM $dataset.$source_table"
bq query --use_legacy_sql=false --format=csv $query | tail -n +2 > ids_urls.csv
> ids_contents.csv
while IFS=, read -r id url; do
    echo "Fetching: $url (ID: $id)"
    content=$(python3 - << EOF
import requests
import time
from bs4 import BeautifulSoup
time.sleep(0.5)
response = requests.get("$url")
soup = BeautifulSoup(response.content, 'html.parser')
content = " ".join(div.get_text() for
  div in soup.find_all('div', class_='👉product-description'))
print(content.replace('"', '""').replace('\n', ' ').replace('\r', ''))
EOF
)
    echo "$id,\"$content\"" >> ids_contents.csv
done < ids_urls.csv
bq load --replace --source_format=CSV --schema='id:STRING,content:STRING' $dataset.$dest_table ids_contents.csv
rm ids_urls.csv ids_contents.csv
```

⚠️ Note: You may need to install the "Beautiful Soup" module first, e.g. with "`pip3 install bs4`".
⚠️ Note: In the Google Cloud Shell, you would call the script with "`bash [scriptname]`".
⚠️ Note: If your results are empty, it may be that the website prevents automated crawling/downloading.
