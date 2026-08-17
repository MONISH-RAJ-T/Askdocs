from sentence_transformers import SentenceTransformer

class Embedder:
    def __init__(self):
        model_name = "BAAI/bge-base-en-v1.5"
        print(f"Loading SentenceTransformer model '{model_name}' into memory...")
        # Loads the cached model from disk (pre-downloaded during build phase)
        self.model = SentenceTransformer(model_name)
        print("Model loaded successfully!")

    def embed_queries(self, queries: list[str]) -> list[list[float]]:
        """
        Embeds query strings.
        For BGE models, we prefix the queries with the retrieval instruction
        to get the highest retrieval accuracy.
        """
        instruction = "Represent this sentence for searching relevant passages: "
        instructed_queries = [f"{instruction}{q}" for q in queries]
        embeddings = self.model.encode(instructed_queries, normalize_embeddings=True)
        return embeddings.tolist()

    def embed_passages(self, passages: list[str]) -> list[list[float]]:
        """
        Embeds passage strings (no instruction prefix needed for passages).
        """
        embeddings = self.model.encode(passages, normalize_embeddings=True)
        return embeddings.tolist()

# Singleton helper
_embedder_instance = None

def get_embedder() -> Embedder:
    global _embedder_instance
    if _embedder_instance is None:
        _embedder_instance = Embedder()
    return _embedder_instance
