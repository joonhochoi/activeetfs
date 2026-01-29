import json
import os

file_path = r'c:\Users\juno\project\activeetfs\app\src\data\activeetfinfos.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

managers = data.get('managers', [])

for manager in managers:
    m_code = manager.get('code')
    common_args = []
    
    if m_code == 'TIME':
        common_args = ["--type", "time"]
    elif m_code == 'KoAct':
        common_args = ["--type", "koact"]
    elif m_code == 'KODEX':
        common_args = ["--type", "kodex"]
    elif m_code == 'RISE':
        common_args = ["--type", "rise"]
        
    if common_args:
        manager['common_args'] = common_args
        
    for etf in manager.get('etfs', []):
        args = etf.get('args', [])
        new_args = []
        skip_next = False
        for i in range(len(args)):
            if skip_next:
                skip_next = False
                continue
            
            arg = args[i]
            if arg == "--type":
                skip_next = True # Skip the value "time", "koact", etc.
                continue
            
            new_args.append(arg)
        
        etf['args'] = new_args

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("JSON refactoring complete.")
