-- Reviews: admin-curated customer reviews (text and/or screenshot image),
-- optionally attached to a product, with featured + active flags for the review wall.
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  reviewer_name text NOT NULL,
  review_text text,
  image_url text,
  rating integer CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A review must carry text and/or an image
  CONSTRAINT reviews_has_content CHECK (
    (review_text IS NOT NULL AND length(btrim(review_text)) > 0)
    OR (image_url IS NOT NULL AND length(btrim(image_url)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_reviews_active ON public.reviews (is_active);
CREATE INDEX IF NOT EXISTS idx_reviews_featured ON public.reviews (featured);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON public.reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_sort ON public.reviews (sort_order, created_at DESC);

-- Reuse existing shared trigger function to maintain updated_at
DROP TRIGGER IF EXISTS set_reviews_updated_at ON public.reviews;
CREATE TRIGGER set_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
