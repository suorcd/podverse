#!/bin/bash

# Configuration
BASE_DIR="infra/k8s/base"
DRY_RUN=false
GLOBAL_PREFIX="podverse-"

echo "==================================================="
echo "   K8s Manifest Standardizer (v5 - Robust)       "
echo "==================================================="

if [ "$DRY_RUN" = true ]; then
  echo "⚠️  DRY RUN MODE: No files will be moved."
  echo "   Set 'DRY_RUN=false' in the script to execute."
  echo ""
fi

# Track used filenames to prevent collisions
declare -A seen_filenames

find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d | while read -r dirpath; do
  dirname=$(basename "$dirpath")
  dirname_singular=${dirname%s} # e.g. "workers" -> "worker"

  echo "📂 Component: $dirname"

  # Reset collision tracker for this folder
  seen_filenames=()

  find "$dirpath" -maxdepth 1 -name "*.yaml" | sort | while read -r file; do
    filename=$(basename "$file")

    # Skip kustomization config
    if [[ "$filename" == "kustomization.yaml" ]]; then continue; fi

    # 1. EXTRACT METADATA (Robust single-match)
    # We use 'head -n 1' to ensure we only get the FIRST resource in a multi-doc file
    kind=$(grep -m 1 "^kind:" "$file" | awk '{print $2}' | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
    raw_name=$(grep -m 1 "^  name:" "$file" | awk '{print $2}' | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')

    if [[ -z "$kind" || -z "$raw_name" ]]; then
      echo "   [SKIP] $filename (Could not parse Kind or Name)"
      continue
    fi

    # 2. GENERATE CLEAN NAME
    # A. Strip global project prefix
    clean_name=${raw_name#"$GLOBAL_PREFIX"}

    # B. Strip component prefix (check both plural "workers-" and singular "worker-")
    clean_name=${clean_name#"$dirname-"}
    clean_name=${clean_name#"$dirname_singular-"}

    # C. Strip Kind suffix (e.g. "ingress-service" -> "ingress")
    clean_name=${clean_name%-"$kind"}
    clean_name=${clean_name%"$kind"}

    # D. Reductions (Fix "services.service.yaml" -> "service.yaml")
    if [[ "$clean_name" == "config" && "$kind" == "configmap" ]]; then clean_name=""; fi
    if [[ "$clean_name" == "service" && "$kind" == "service" ]]; then clean_name=""; fi
    if [[ "$clean_name" == "services" && "$kind" == "service" ]]; then clean_name=""; fi
    if [[ "$clean_name" == "deployments" && "$kind" == "deployment" ]]; then clean_name=""; fi

    # 3. CONSTRUCT NEW FILENAME
    if [[ -z "$clean_name" || "$clean_name" == "$dirname" || "$clean_name" == "$dirname_singular" ]]; then
      new_filename="${kind}.yaml"
    else
      new_filename="${clean_name}.${kind}.yaml"
    fi

    # 4. COLLISION CHECK
    if [[ -n "${seen_filenames[$new_filename]}" ]]; then
      echo "   🔴 [COLLISION] $filename wants to be '$new_filename' but it is taken."
      echo "      ACTION: Check 'metadata.name' in $filename. It is identical to another file!"
      continue
    else
      seen_filenames[$new_filename]=1
    fi

    # 5. EXECUTE
    if [[ "$filename" != "$new_filename" ]]; then
      echo "   ✅ [RENAME] $filename  ->  $new_filename"

      if [ "$DRY_RUN" = false ]; then
        mv "$file" "$dirpath/$new_filename"

        # Update kustomization.yaml automatically
        kust_file="$dirpath/kustomization.yaml"
        if [[ -f "$kust_file" ]]; then
          # Portable sed for Linux/Mac
          sed -i.bak "s|${filename}|${new_filename}|g" "$kust_file" && rm "$kust_file.bak"
        fi
      fi
    else
      echo "   ok [KEEP]   $filename"
    fi
  done
done
echo "==================================================="
