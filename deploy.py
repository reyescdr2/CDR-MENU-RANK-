import os
import shutil
import sys

# Ruta destino proporcionada por el usuario
bedrock_base_path = r"C:\Users\Administrator\AppData\Roaming\Minecraft Bedrock\Users\Shared\games\com.mojang"

BP_DEST_DIR = os.path.join(bedrock_base_path, "development_behavior_packs", "CDR MENU BP")
RP_DEST_DIR = os.path.join(bedrock_base_path, "development_resource_packs", "CDR MENU RP")
RANK_BP_DEST_DIR = os.path.join(bedrock_base_path, "development_behavior_packs", "CDR RANK BP")

# Ruta de origen (la carpeta actual donde se encuentra este script)
SOURCE_DIR = os.path.dirname(os.path.abspath(__file__))
BP_SRC_DIR = os.path.join(SOURCE_DIR, "CDR MENU BP")
RP_SRC_DIR = os.path.join(SOURCE_DIR, "CDR MENU RP")
RANK_BP_SRC_DIR = os.path.join(SOURCE_DIR, "CDR RANK BP")

def copy_dir(src, dst):
    """Limpia el destino y copia el contenido del origen."""
    if not os.path.exists(src):
        print(f"ERROR: No se encontró la carpeta de origen -> {src}")
        return False

    try:
        # Borrado explícito antes de copiar
        if os.path.exists(dst):
            print(f"Limpiando destino: {os.path.basename(dst)}...")
            shutil.rmtree(dst, ignore_errors=True)
            # Verificación extra por si ignore_errors dejó algo
            if os.path.exists(dst):
                shutil.rmtree(dst)
        
        shutil.copytree(src, dst)
        print(f"Copiado con éxito: {os.path.basename(src)}")
        return True
    except Exception as e:
        print(f"Error fatal desplegando {os.path.basename(src)}: {e}")
        return False

def deploy():
    print("=== Despliegue de Addon a Development Packs ===")
    
    print(f"\nVerificando destinos:")
    print(f"BP -> {BP_DEST_DIR}")
    print(f"RP -> {RP_DEST_DIR}")
    print(f"RANK BP -> {RANK_BP_DEST_DIR}\n")
    
    bp_success = copy_dir(BP_SRC_DIR, BP_DEST_DIR)
    rp_success = copy_dir(RP_SRC_DIR, RP_DEST_DIR)
    rank_bp_success = copy_dir(RANK_BP_SRC_DIR, RANK_BP_DEST_DIR)
    
    if bp_success and rp_success and rank_bp_success:
        print("\n¡Despliegue completado con éxito!")
        print("Abre Minecraft, el addon debería estar actualizado en tus recursos/comportamientos de desarrollo.")
    else:
        print("\nHubo errores durante el despliegue.")

if __name__ == "__main__":
    deploy()
