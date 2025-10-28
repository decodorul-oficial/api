#!/usr/bin/env python3
"""
Script pentru a adăuga virgula lipsă după commentIdSchema
"""

def fix_comma():
    file_path = '/Users/radunie/Projects/MonitorulOficial/api/api/src/api/resolvers.js'
    
    # Citește fișierul
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Înlocuiește commentIdSchema cu commentIdSchema,
    new_content = content.replace('  commentIdSchema\n  commentParentTypeSchema', '  commentIdSchema,\n  commentParentTypeSchema')
    
    # Verifică dacă s-a făcut modificarea
    if new_content != content:
        # Scrie fișierul modificat
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("✅ Virgula a fost adăugată cu succes!")
        return True
    else:
        print("❌ Nu s-a găsit pattern-ul pentru modificare")
        return False

if __name__ == "__main__":
    fix_comma()
