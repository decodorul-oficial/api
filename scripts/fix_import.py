#!/usr/bin/env python3
"""
Script pentru a corecta importul lipsă commentParentTypeSchema în resolvers.js
"""

import re

def fix_import():
    file_path = '/Users/radunie/Projects/MonitorulOficial/api/api/src/api/resolvers.js'
    
    # Citește fișierul
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Găsește linia cu commentIdSchema și adaugă commentParentTypeSchema
    pattern = r'(\s+commentIdSchema\n\s+)\} from \'\.\./config/validation\.js\';'
    replacement = r'\1  commentParentTypeSchema\n} from \'../config/validation.js\';'
    
    # Aplică înlocuirea
    new_content = re.sub(pattern, replacement, content)
    
    # Dacă nu s-a găsit pattern-ul, încercă o abordare diferită
    if new_content == content:
        # Caută linia exactă
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if 'commentIdSchema' in line and 'from' not in line:
                # Adaugă commentParentTypeSchema pe linia următoare
                lines.insert(i + 1, '  commentParentTypeSchema')
                new_content = '\n'.join(lines)
                break
    
    # Verifică dacă s-a făcut modificarea
    if new_content != content:
        # Scrie fișierul modificat
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("✅ Importul commentParentTypeSchema a fost adăugat cu succes!")
        return True
    else:
        print("❌ Nu s-a găsit pattern-ul pentru modificare")
        return False

if __name__ == "__main__":
    fix_import()