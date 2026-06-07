/*
  # Telegram bot: ship-with-tracking + restock-on-cancel

  - ship: tapping "Ship" now asks for a tracking number via a force_reply prompt; the reply is
    saved and the order is marked shipped atomically (tg_ship_order). ship_prompt_message_id ties
    a reply back to the right order.
  - cancel: cancelling a confirmed/processing order now RESTOCKS the deducted inventory, atomically
    (tg_cancel_order). new->cancelled never restocks (nothing was deducted). The admin dashboard does
    the equivalent restock client-side (it runs on the anon key and can't call service_role RPCs),
    so both channels restock consistently.
*/

ALTER TABLE order_telegram_messages ADD COLUMN IF NOT EXISTS ship_prompt_message_id BIGINT;

-- Mark shipped (optionally with a tracking number), conditional claim + actor, one txn.
CREATE OR REPLACE FUNCTION public.tg_ship_order(p_order_id UUID, p_actor TEXT, p_tracking TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_affected INT;
BEGIN
  UPDATE orders
    SET order_status = 'shipped',
        tracking_number = COALESCE(NULLIF(p_tracking, ''), tracking_number),
        updated_at = NOW()
    WHERE id = p_order_id AND order_status = ANY(ARRAY['confirmed','processing']);
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RETURN jsonb_build_object('status', 'already');
  END IF;

  INSERT INTO order_telegram_messages (order_id, pending_actor, pending_actor_status, ship_prompt_message_id)
  VALUES (p_order_id, p_actor, 'shipped', NULL)
  ON CONFLICT (order_id) DO UPDATE SET
    pending_actor          = EXCLUDED.pending_actor,
    pending_actor_status   = EXCLUDED.pending_actor_status,
    ship_prompt_message_id = NULL;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.tg_ship_order(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_ship_order(UUID, TEXT, TEXT) TO service_role;

-- Cancel + restock (only when stock was actually deducted: confirmed/processing). Atomic.
CREATE OR REPLACE FUNCTION public.tg_cancel_order(p_order_id UUID, p_actor TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_items JSONB;
  rec     RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_order.order_status NOT IN ('new', 'confirmed', 'processing') THEN
    RETURN jsonb_build_object('status', 'already', 'current', v_order.order_status);
  END IF;

  -- restock only if stock was previously deducted (i.e. order was confirmed/processing)
  IF v_order.order_status IN ('confirmed', 'processing') THEN
    v_items := CASE WHEN jsonb_typeof(v_order.order_items) = 'array' THEN v_order.order_items ELSE '[]'::jsonb END;
    FOR rec IN
      SELECT NULLIF(value->>'variation_id', '') AS vid,
             value->>'product_id'               AS pid,
             SUM(COALESCE((value->>'quantity')::int, 0)) AS qty
      FROM jsonb_array_elements(v_items) AS t(value)
      GROUP BY 1, 2
      ORDER BY 1 NULLS LAST, 2
    LOOP
      IF rec.vid IS NOT NULL THEN
        UPDATE product_variations SET stock_quantity = stock_quantity + rec.qty WHERE id = rec.vid::uuid;
      ELSE
        UPDATE products SET stock_quantity = stock_quantity + rec.qty WHERE id = rec.pid::uuid;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO order_telegram_messages (order_id, pending_actor, pending_actor_status)
  VALUES (p_order_id, p_actor, 'cancelled')
  ON CONFLICT (order_id) DO UPDATE SET
    pending_actor        = EXCLUDED.pending_actor,
    pending_actor_status = EXCLUDED.pending_actor_status;

  UPDATE orders SET order_status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'ok', 'restocked', v_order.order_status IN ('confirmed','processing'));
END;
$$;
REVOKE ALL ON FUNCTION public.tg_cancel_order(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_cancel_order(UUID, TEXT) TO service_role;
