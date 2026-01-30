#!/bin/bash

# ComfyUI 缺失模型下载脚本
# 复制到 ComfyUI 根目录运行

# 模型下载目录 (使用 /tmp 因为远程磁盘已满)
MODEL_DIR="/tmp/comfyui_models"
LORA_DIR="$MODEL_DIR/loras"
CHECKPOINT_DIR="$MODEL_DIR/checkpoints"
VAE_DIR="$MODEL_DIR/vae"

# 创建目录
mkdir -p "$LORA_DIR"
mkdir -p "$CHECKPOINT_DIR"
mkdir -p "$VAE_DIR"

echo "=== ComfyUI 模型下载脚本 ==="
echo ""
echo "下载目录: $MODEL_DIR"
echo "下载完成后请手动移动到 ComfyUI 的 models 文件夹"
echo ""

# 下载函数
download_model() {
    local url=$1
    local output=$2
    local dir=$3

    echo "下载: $output"
    if [ -n "$dir" ]; then
        curl -L -o "$dir/$output" "$url"
    else
        curl -L -o "$output" "$url"
    fi
    echo ""
}

# ============ LoRA 模型 ============
echo ">>> 下载 LoRA 模型..."

# Dramatic Lighting Slider
download_model "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/model/2654852/dramatic20lighting.6xMK.safetensors?X-Amz-Expires=86400&response-content-disposition=attachment%3B%20filename%3D%22Dramatic%20Lighting%20Slider.safetensors%22&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=e01358d793ad6966166af8b3064953ad/20260130/us-east-1/s3/aws4_request&X-Amz-Date=20260130T075659Z&X-Amz-SignedHeaders=host&X-Amz-Signature=44d1d8592aa52c0823bc25862d8e4fd70fd370c43a93e4b4b688f1ef9a4cacce" "Dramatic Lighting Slider.safetensors" "$LORA_DIR"

# Pussy_Spreading_v5i_XL (Civitai)
download_model "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/model/1276645/pussySpreadingV5iXL.SRcP.safetensors?X-Amz-Expires=86400&response-content-disposition=attachment%3B%20filename%3D%22Pussy_Spreading_v5i_XL.safetensors%22&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=e01358d793ad6966166af8b3064953ad/20260130/us-east-1/s3/aws4_request&X-Amz-Date=20260130T075905Z&X-Amz-SignedHeaders=host&X-Amz-Signature=f4f57e509ada121ee977bf38c2b6cd51c0771d998c0ae476abf582b46c7eb5a3" "Pussy_Spreading_v5i_XL.safetensors" "$LORA_DIR"

# add_detail
download_model "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/model/2654852/addDetailsV12.H99t.safetensors?X-Amz-Expires=86400&response-content-disposition=attachment%3B%20filename%3D%22Add_Details_v1.2.safetensors%22&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=e01358d793ad6966166af8b3064953ad/20260130/us-east-1/s3/aws4_request&X-Amz-Date=20260130T080150Z&X-Amz-SignedHeaders=host&X-Amz-Signature=e4ae4db98ae6fe71563e3c10db86fbe5fc1e2d6f22116c1756ee934512aeef44" "add_detail.safetensors" "$LORA_DIR"

# TRT_style_v1.4_IL
download_model "https://civitai.com/api/download/models/xxxxx" "TRT_style_v1.4_IL.safetensors" "$LORA_DIR"

# XL (真实皮肤XL)
download_model "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/model/2654852/realskinXxxlV1.MXKy.safetensors?X-Amz-Expires=86400&response-content-disposition=attachment%3B%20filename%3D%22RealSkin_xxXL_v1.safetensors%22&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=e01358d793ad6966166af8b3064953ad/20260130/us-east-1/s3/aws4_request&X-Amz-Date=20260130T082655Z&X-Amz-SignedHeaders=host&X-Amz-Signature=bd0a27ddc96d5435f8806c1efe6c2962a60380eb1f8c2cb6df8abfde66d42197" "Real Skin Slider.safetensors" "$LORA_DIR"

# MoriiMee_Gothic_Niji_Style_Illustrious_r1
download_model "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/model/178325/moriimeeGothic.Dijf.safetensors?X-Amz-Expires=86400&response-content-disposition=attachment%3B%20filename%3D%22MoriiMee_Gothic_Realistic.safetensors%22&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=e01358d793ad6966166af8b3064953ad/20260130/us-east-1/s3/aws4_request&X-Amz-Date=20260130T081708Z&X-Amz-SignedHeaders=host&X-Amz-Signature=4669b947dfbf36b5b69a36028608f67bc0ac8b13070a68f1c6ca7d322dca655b" "MoriiMee_Gothic_Niji_Style_Illustrious_r1.safetensors" "$LORA_DIR"

# ============ VAE 模型 ============
echo ">>> 下载 VAE 模型..."

# aaaAnimeSDXLVAE_v2
download_model "https://cas-bridge.xethub.hf.co/xet-bridge-us/67d3a2c1536175c33a849663/9fa04f2f3eb1651adbf80463313cdfe9a8dc58c8db78a23d5957c2b71d2a4a55?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cas%2F20260130%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260130T083308Z&X-Amz-Expires=3600&X-Amz-Signature=7dedf5dc4c86721305e170e37dc4be303046d70fd245b068ce1058260c8c7424&X-Amz-SignedHeaders=host&X-Xet-Cas-Uid=public&response-content-disposition=attachment%3B+filename*%3DUTF-8%27%27aaaAnimeSDXLVAE_v15_947730.safetensors%3B+filename%3D%22aaaAnimeSDXLVAE_v15_947730.safetensors%22%3B&x-id=GetObject&Expires=1769765588&Policy=eyJTdGF0ZW1lbnQiOlt7IkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc2OTc2NTU4OH19LCJSZXNvdXJjZSI6Imh0dHBzOi8vY2FzLWJyaWRnZS54ZXRodWIuaGYuY28veGV0LWJyaWRnZS11cy82N2QzYTJjMTUzNjE3NWMzM2E4NDk2NjMvOWZhMDRmMmYzZWIxNjUxYWRiZjgwNDYzMzEzY2RmZTlhOGRjNThjOGRiNzhhMjNkNTk1N2MyYjcxZDJhNGE1NSoifV19&Signature=CVFsjkXGw6NzlpCZoa0-9ANU2xoo7097Gb3ZQxFBU93ayk0BNboMnqJBPjR5PvfTKRWxKJJOb%7Eq8D3RtG8jCTbHmgwNleVWWXRAg17uzEpIdvveo7ldjcPEFK55P0WVDYdLBYgYj9TPGTllkiXnac4ZHf8B9c-kl1UoVr2E3JqEJJhM%7E2xasMa6lK5w5Z3TQhHEJJ0TvdzNkoYJRL0bwzBNCzunZ%7EAWFGgLG%7Ei1M-tnVsXUU16T73UOe4G0VZ22eH6pV5PMxMgEzfzZCdv51KfkKOA9tJYZyX0zXVrh7UJ4uGG-2HOpHCluUQU-pdV6r230Q%7ESHckmNoFNhd5u1QtQ__&Key-Pair-Id=K2L8F4GPSG1IFC" "aaaAnimeSDXLVAE_v2.safetensors" "$VAE_DIR"

# ============ Checkpoint 模型 ============
echo ">>> 下载 Checkpoint 模型..."

# hyphoriaIlluNAI_v001
download_model "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/model/1490120/mergedIllustrious.R3ba.safetensors?X-Amz-Expires=86400&response-content-disposition=attachment%3B%20filename%3D%22hyphoriaIlluNAI_v001.safetensors%22&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=e01358d793ad6966166af8b3064953ad/20260130/us-east-1/s3/aws4_request&X-Amz-Date=20260130T083616Z&X-Amz-SignedHeaders=host&X-Amz-Signature=e28df332341b131978a3f9139ff79df2bdfcde0e88b08498e1c393af735cc49a" "hyphoriaIlluNAI_v001.safetensors" "$CHECKPOINT_DIR"

# oneObsessionBranch_matureMAXEPS
download_model "https://civitai-delivery-worker-prod.5ac0637cfd0766c97916cefa3764fbdf.r2.cloudflarestorage.com/model/4313379/one20obsession.mIkb.safetensors?X-Amz-Expires=86400&response-content-disposition=attachment%3B%20filename%3D%22oneObsessionBranch_matureMAXEPS.safetensors%22&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=e01358d793ad6966166af8b3064953ad/20260130/us-east-1/s3/aws4_request&X-Amz-Date=20260130T081906Z&X-Amz-SignedHeaders=host&X-Amz-Signature=e6a951dc9d84b0a139130e1d6f9e57d1ee57cc6832b8ab529181bebf9f6a9e63" "oneObsessionBranch_matureMAXEPS.safetensors" "$CHECKPOINT_DIR"

echo "=== 下载完成 ==="
echo ""
echo "注意: 请将上面的 xxxxx 替换为实际的下载链接"
echo "可以从以下网站获取链接:"
echo "  - Civitai: https://civitai.com"
echo "  - Hugging Face: https://huggingface.co/models"
