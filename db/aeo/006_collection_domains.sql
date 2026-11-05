-- Limit AEO collection to each declared normalized hostname; preserve explicit policies.
INSERT INTO liekan_collection_policy(website_id,allowed_hostnames)
SELECT w.website_id,ARRAY[regexp_replace(regexp_replace(lower(w.domain),'[.]$',''),'^www[.]','')] FROM website w
JOIN aeo_site_settings a ON a.website_id=w.website_id
WHERE w.deleted_at IS NULL
ON CONFLICT(website_id) DO NOTHING;

UPDATE liekan_collection_policy p
SET allowed_hostnames=ARRAY[regexp_replace(regexp_replace(lower(w.domain),'[.]$',''),'^www[.]','')],revision=p.revision+1,updated_at=now()
FROM website w JOIN aeo_site_settings a ON a.website_id=w.website_id
WHERE p.website_id=w.website_id AND w.deleted_at IS NULL
AND p.mode='standard' AND cardinality(p.allowed_hostnames)=0;
