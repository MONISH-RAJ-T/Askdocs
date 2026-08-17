class RecursiveCharacterTextSplitter:
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200, separators: list[str] = None):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", " ", ""]

    def split_text(self, text: str) -> list[str]:
        """
        Splits a single continuous string into smaller, overlapping chunks recursively.
        """
        # Remove excessive whitespace and blank lines before splitting
        cleaned_text = self._clean_text(text)
        return self._split_text(cleaned_text, self.separators)

    def _clean_text(self, text: str) -> str:
        # Standardize newlines
        text = text.replace("\r\n", "\n")
        # Remove consecutive empty lines (more than two newlines)
        import re
        text = re.sub(r'\n{3,}', '\n\n', text)
        # Remove excessive horizontal spacing
        text = re.sub(r'[ \t]+', ' ', text)
        return text.strip()

    def _split_text(self, text: str, separators: list[str]) -> list[str]:
        if not separators:
            return [text]
        
        separator = separators[0]
        new_separators = separators[1:]
        
        if separator == "":
            splits = list(text)
        else:
            splits = text.split(separator)
            
        final_chunks = []
        current_chunk = []
        current_len = 0
        
        for split in splits:
            split_len = len(split)
            # Add separator length only if current_chunk is not empty
            sep_len = len(separator) if current_chunk else 0
            
            if current_len + split_len + sep_len <= self.chunk_size:
                current_chunk.append(split)
                current_len += split_len + sep_len
            else:
                if current_chunk:
                    final_chunks.append(separator.join(current_chunk))
                
                # Build overlap from the end of current_chunk
                overlap_text = []
                overlap_len = 0
                for item in reversed(current_chunk):
                    item_sep_len = len(separator) if overlap_text else 0
                    if overlap_len + len(item) + item_sep_len <= self.chunk_overlap:
                        overlap_text.insert(0, item)
                        overlap_len += len(item) + item_sep_len
                    else:
                        break
                
                current_chunk = overlap_text
                current_len = overlap_len
                
                # If a single split is larger than chunk_size, split it recursively
                if split_len > self.chunk_size:
                    sub_chunks = self._split_text(split, new_separators)
                    for sc in sub_chunks:
                        sc_sep_len = len(separator) if current_chunk else 0
                        if current_len + len(sc) + sc_sep_len <= self.chunk_size:
                            current_chunk.append(sc)
                            current_len += len(sc) + sc_sep_len
                        else:
                            if current_chunk:
                                final_chunks.append(separator.join(current_chunk))
                            current_chunk = [sc]
                            current_len = len(sc)
                else:
                    current_chunk.append(split)
                    current_len += split_len + (len(separator) if len(current_chunk) > 1 else 0)
                    
        if current_chunk:
            final_chunks.append(separator.join(current_chunk))
            
        return final_chunks
