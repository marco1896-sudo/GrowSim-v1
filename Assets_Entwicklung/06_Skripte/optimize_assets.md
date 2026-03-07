# Optimize Assets (Template)

## Beispiel (ImageMagick)
```bash
magick input.png -strip -quality 86 -resize 1536x1536> output.webp
```

Batch-Regel:
- Mobile: max 2048px, Ziel <450KB wenn möglich
- HD: max 4096px, visuell verlustarm
