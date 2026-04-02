-- Fix empty strings replacing them with NULL to avoid unique constraint violations
UPDATE public.user_profiles
SET greythr_user_id = NULL
WHERE greythr_user_id = '';
