# Failure Cases and Limitations

- OCR quality depends on scan resolution, skew, contrast, and font size.
- Tesseract and Poppler are system dependencies; the app reports missing binaries but cannot OCR without them.
- Merged or rotated tables may still need manual review.
- Dense embeddings are weak for exact model numbers, so exact model matching is handled separately.
- Comparable product mode improves with more products in the same domain; a tiny corpus may have no true alternatives.
- Confidence thresholds are reasonable defaults and should be calibrated with labeled production queries.
- Handwritten annotations, CAD drawings, and image-only product photos are out of scope for reliable extraction.
