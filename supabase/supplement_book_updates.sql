begin;

update public.supplements
set
  description = 'A plant flavonoid from chamomile that is used for relaxation, sleep, and mild antioxidant support.',
  what_is_it = 'Apigenin is a plant flavonoid found in chamomile, parsley, celery, and some fruits. It is commonly taken as an isolated supplement or as chamomile extract in capsules, tinctures, or teas to support relaxation, sleep, and general cellular health.',
  why_use_it = 'Apigenin is used to reduce anxiety, support restful sleep, and provide mild anti-inflammatory and antioxidant effects. It is often taken in the evening to promote calmness without strong sedation or next-day drowsiness.',
  how_does_it_work = 'Apigenin interacts with the GABA system, promoting a calming effect similar to mild sedatives but without the same dependence risk. It may also influence serotonin pathways. Its antioxidant and anti-inflammatory actions help reduce cellular stress and support overall health.',
  side_effects = 'Apigenin is generally well tolerated. Some people may experience mild drowsiness, nausea, or gastrointestinal discomfort. Those with allergies to chamomile or related plants should use caution.',
  risks_and_interactions = 'Apigenin may enhance the effects of sedatives, including alcohol, sleep medications, and antihistamines. Use caution with antidepressants or other neurological medications and seek medical advice if unsure.',
  who_might_benefit = 'Adults with mild anxiety, stress, or difficulty sleeping may benefit, particularly those seeking a gentle, plant-based option.',
  evidence = 'Evidence is mixed and condition-specific: Amsterdam et al. (2012) in Alternative Therapies in Health and Medicine found chamomile extract capsules reduced depression symptoms in people with anxiety but results were uncertain in diagnosed depression, ranked 18th of 18 for mood support; Adib-Hajbaghery et al. (2017) in Complementary Therapies in Medicine found 400 mg chamomile extract twice daily for 4 weeks improved sleep quality in elderly nursing home residents, ranked 10th of 11 for sleep support; Valmy et al. (2025) in Phytotherapy Research reported a meta-analysis of 11 trials showing reduced pain and local tissue inflammation but not broader inflammation markers or bleeding, ranked 32nd of 38 for anti-inflammatory supplements; Skovgaard et al. (2006) in Journal of Cosmetic Dermatology found a multi-ingredient supplement containing chamomile extract improved wrinkles, firmness, and dark circles, but chamomile''s specific contribution could not be isolated, ranked 13th of 15 for anti-ageing supplements.',
  evidence_score = 36,
  how_to_use = 'Typical daily dose: 50-150 mg. For sleep: 50-150 mg taken 30-60 minutes before bed. Daytime use: Lower doses may be used if not sedating.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Typical daily dose: 50-150 mg. For sleep: 50-150 mg taken 30-60 minutes before bed.',
    'parser_method', 'direct_text_parse',
    'per_intake_max_value', 150,
    'per_intake_min_value', 50,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Apigenin (Chamomile Extract)'
  and status = 'approved';

update public.supplements
set
  description = 'A fermented apple juice product used mainly for appetite, blood sugar, and digestive support.',
  what_is_it = 'Apple cider vinegar (ACV) is made by fermenting apple juice into acetic acid, its main active component. It also contains small amounts of potassium, amino acids, antioxidants, and the probiotic-rich mother. It is sold as a liquid, capsules, or gummies.',
  why_use_it = 'ACV may help with appetite control and modest weight loss when paired with diet changes. It may also improve insulin sensitivity, reduce post-meal blood sugar spikes, ease bloating or indigestion, and support cholesterol balance.',
  how_does_it_work = 'Acetic acid may increase fullness, slow carbohydrate digestion, and reduce post-meal blood glucose. Unfiltered ACV with the mother may support gut microbiome balance, and it may also have mild antibacterial and antifungal effects.',
  side_effects = 'ACV is generally safe when diluted, but it can cause stomach discomfort, tooth enamel erosion, or throat irritation if taken undiluted. High intake may lower potassium levels.',
  risks_and_interactions = 'ACV may enhance the effects of diabetes medications and increase the risk of low blood sugar. It can also interact with diuretics, digoxin, and antacids. Seek medical advice if you take regular medication.',
  who_might_benefit = 'People seeking appetite control, blood sugar support, or digestive improvement.',
  evidence = 'Evidence is strongest for blood sugar control and weight management. Castagna et al. (2025, Nutrients) reviewed 10 randomized trials in 789 people with type 2 diabetes and/or overweight and found 5-30 ml daily for 4-12 weeks produced modest weight loss and lower BMI, with the largest effects at 30 ml per day; limitations included short duration and trial variability. Arjmandfard et al. (2025, Frontiers in Nutrition) analyzed seven trials in 463 people with type 2 diabetes and found daily ACV lowered fasting glucose and HbA1c, with greater benefit above about 10 ml per day; limitations included controlled-trial heterogeneity. Hadi et al. (2021, BMC Complementary Medicine and Therapies) found across nine studies that ACV lowered total cholesterol and triglycerides, especially in people with type 2 diabetes using 15 ml or less daily for more than eight weeks, but LDL and HDL changed little. Kannan et al. (2024, Asian Food Science Journal) reported improved digestion and related symptoms in 45 overweight adults taking one ACV tablet daily for 30 days plus diet and exercise, but the uncontrolled, self-reported design makes the findings less reliable.',
  evidence_score = 71,
  how_to_use = 'Typical dose is 1-2 tablespoons diluted in water once or twice daily, ideally before meals. Always dilute it and start with a small amount.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'ml',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 1-2 tablespoons diluted in water, once or twice daily. Timing: Ideally taken before meals.',
    'parser_method', 'converted_tablespoons_to_ml',
    'per_intake_max_value', 30,
    'per_intake_min_value', 15,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Apple Cider Vinegar (ACV)'
  and status = 'approved';

update public.supplements
set
  description = 'Ashwagandha is an adaptogenic herb used to help the body handle stress and support sleep, performance, hormones, and cognition.',
  what_is_it = 'Ashwagandha (Withania somnifera), also known as Indian ginseng or winter cherry, is a traditional Ayurvedic adaptogenic herb used for more than 3,000 years. Its main active compounds include withanolides, alkaloids, and saponins.',
  why_use_it = 'It is used to reduce stress and anxiety, improve sleep, support strength, endurance, recovery, testosterone and hormonal balance, boost memory and cognitive clarity, and help reduce inflammation, oxidative stress, and blood sugar.',
  how_does_it_work = 'It appears to modulate the stress response and endocrine systems by lowering cortisol through the HPA axis, influencing GABA and serotonin signaling, supporting mitochondrial function and ATP production, reducing inflammation and oxidative stress, and affecting thyroid, adrenal, and reproductive hormones.',
  side_effects = 'Generally safe and well tolerated. Possible side effects include mild sedation, gastrointestinal discomfort, headache, increased thyroid activity, and rarely allergic reactions.',
  risks_and_interactions = 'May interact with sedatives or anxiolytics, thyroid medications, immunosuppressants, diabetes medications, and antihypertensives. Monitor for hypoglycaemia if used with diabetes drugs. Avoid during pregnancy because of possible uterine stimulation. Avoid high doses without professional guidance.',
  who_might_benefit = 'Stressed professionals or students, people with anxiety, poor sleep, or burnout, athletes seeking performance and recovery support, men with low testosterone or libido, people with inflammatory conditions, and those with thyroid or adrenal imbalances under supervision.',
  evidence = 'Evidence is strongest for stress relief and sleep support, with Salve et al. 2019 in Medicine showing 240 mg daily for 60 days lowered stress scores and cortisol in stressed adults, and Cheah et al. 2021 in PLOS One pooling 5 randomized trials in over 400 adults showing improved sleep outcomes with typical doses of 240-600 mg/day for 6-8 weeks; endurance, strength, cognitive, and anti-inflammatory benefits are supported by smaller randomized trials such as Tiwari et al. 2021 in the Journal of the International Society of Sports Nutrition, Wankhede et al. 2015 in the Journal of the International Society of Sports Nutrition, Choudhary et al. 2017 in the Journal of Dietary Supplements, Gopukumar et al. 2021 in Molecular Medicine Reports, and Raut et al. 2024 in Cureus, while blood sugar and testosterone findings are promising but limited by small or short studies including Durg et al. 2020 in Phytotherapy Research and Lopresti et al. 2019 in American Journal of Men''s Health.',
  evidence_score = 85,
  how_to_use = 'For stress or sleep, take 300-600 mg in the evening or before bed with food. For performance or testosterone support, take 300-600 mg in the morning or before exercise with food. A common approach is to use it for 6-8 weeks, then take a 1-2 week break.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('per_intake'),
    'confidence', 0.93,
    'source_text', '300-600 mg in the evening or before bed, with food. Performance / testosterone: 300-600 mg in the morning or before exercise.',
    'parser_method', 'manual',
    'per_intake_max_value', 600,
    'per_intake_min_value', 300,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Ashwagandha (Withania somnifera)'
  and status = 'approved';

update public.supplements
set
  description = 'Astaxanthin is a red algae-derived carotenoid antioxidant used for skin, inflammation, exercise recovery, eye, brain, and cardiometabolic support.',
  what_is_it = 'Astaxanthin is a red carotenoid pigment from microalgae and the seafood that eat them, usually taken as an algae-derived supplement. It is a lipid-soluble antioxidant that can cross the blood-brain barrier and blood-retinal barrier.',
  why_use_it = 'People use astaxanthin to support skin elasticity and moisture, reduce UV-related skin damage, dampen inflammation, improve exercise performance and recovery, ease eye strain, support cognition, and modestly improve blood pressure and lipid markers.',
  how_does_it_work = 'Astaxanthin embeds in cell membranes and lipoproteins, scavenges reactive oxygen species, and down-regulates inflammatory mediators such as NF-kB and COX-2. This may help stabilize tissues under oxidative and inflammatory stress and support mitochondrial function, endothelial health, and lipid handling.',
  side_effects = 'At typical doses it is generally well tolerated, but may cause reddish stool, mild skin color changes, gastrointestinal upset, headache, and a slight lowering of blood pressure.',
  risks_and_interactions = 'Use caution with antihypertensives, blood thinners, and glucose-lowering medications because astaxanthin may add to their effects. Avoid during pregnancy or breastfeeding. People with shellfish allergy should avoid krill-based products and use algae-derived forms instead.',
  who_might_benefit = 'Athletes and active individuals, people concerned about skin aging or sun exposure, those with high screen time or cardiovascular risk, and older adults seeking extra antioxidant support.',
  evidence = 'Evidence is mixed but generally modest: Zhou et al. (2021, Nutrients) found in a systematic review and meta-analysis of 369 participants that oral or topical astaxanthin improved skin moisture, elasticity, and wrinkles, though dose and treatment differences limited certainty; Youssef et al. (2025, Frontiers in Pharmacology) reported that 12 mg/day for 7 days lowered IL-6, TNF-alpha, and CRP in pneumonia patients, but this was a short trial; Tsao et al. (2025, BMC Sports Science, Medicine and Rehabilitation) found 28 mg/day for 4 days improved cycling endurance and muscle damage markers in 10 young men, but the sample was very small; Hayashi et al. (2018, Journal of Clinical Biochemistry and Nutrition) and Katagiri et al. (2012, Journal of Clinical Biochemistry and Nutrition) showed only small or inconsistent cognitive effects; Leung et al. (2022, Nutrients) found a small systolic blood pressure reduction of about 4 mmHg mainly in longer studies; and Laurindo et al. (2025, Nutrients) found HDL increased and triglycerides decreased across 8 trials using 6-20 mg/day, while LDL and total cholesterol were inconsistent.',
  evidence_score = 54,
  how_to_use = 'Typical dose is 4-12 mg/day taken with a fat-containing meal. Use for at least several weeks, and periodic breaks are sometimes suggested.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 4-12 mg/day with a fat-containing meal.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 12,
    'per_intake_min_value', 4,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Astaxanthin'
  and status = 'approved';

update public.supplements
set
  description = 'A creeping Ayurvedic herb used as a brain tonic that may gradually support memory, attention, and mental clarity.',
  what_is_it = 'Bacopa monnieri (Brahmi) is a creeping aquatic herb used in Ayurvedic medicine as a brain tonic. Extracts are standardised to bacosides, compounds thought to drive its cognitive effects. It is commonly taken as capsules or liquid for memory and concentration support.',
  why_use_it = 'Bacopa is used to support memory, learning, and attention. It may improve recall, processing speed, and mental clarity over time. Some people also use it for mild anxiety reduction and mental fatigue, supporting sustained focus.',
  how_does_it_work = 'Bacosides influence neurotransmitters such as acetylcholine, serotonin, and dopamine, which are important for learning and memory. Bacopa may enhance synaptic plasticity in the brain and provide antioxidant protection, helping to reduce oxidative stress and support long-term cognitive function.',
  side_effects = 'Digestive symptoms such as nausea, cramping, or loose stools are common, especially initially. Some people report mild fatigue or a calming effect. Taking it with food and starting with a low dose may improve tolerance.',
  risks_and_interactions = 'Bacopa may interact with medications affecting brain chemistry, including antidepressants, antiepileptics, and cholinesterase inhibitors. It may also enhance sedative effects. Use caution with thyroid medication and avoid in pregnancy or breastfeeding.',
  who_might_benefit = 'Students, professionals, and older adults seeking gradual improvements in memory, focus, and cognitive resilience.',
  evidence = 'Kongkeaw et al. (2014), Journal of Ethnopharmacology, meta-analysis of 9 placebo-controlled trials in 518 adults found Bacopa monnieri improved thinking speed but memory results were mixed; ranked 3rd out of 24 for cognitive support supplements, with variability across memory measures. Peth-Nui et al. (2012), Evidence-Based Complementary and Alternative Medicine, in 60 healthy older adults, 300-600 mg daily for 12 weeks improved attention, processing speed, and recall versus placebo; ranked 4th out of 9 for concentration enhancing supplements. Morgan et al. (2010), Journal of Alternative and Complementary Medicine, in adults over 55, 300 mg daily for 12 weeks improved verbal learning and delayed recall but increased gastrointestinal side effects; ranked 8th out of 20 for memory enhancing supplements, with gut tolerance limitations.',
  evidence_score = 72,
  how_to_use = 'Typical dose: 250-450 mg daily of standardised extract, taken with meals. Use consistently for several weeks for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardised_extract', 'with_meals'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 250-450 mg daily of standardised extract, taken with meals.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 450,
    'per_intake_min_value', 250,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Bacopa Monnieri'
  and status = 'approved';

update public.supplements
set
  description = 'A group of water-soluble vitamins that support energy metabolism, nervous system function, and red blood cell formation.',
  what_is_it = 'B vitamins are a group of water-soluble nutrients that support energy production and nervous system function. A typical complex includes B1, B2, B3, B5, B6, B7, B9, and B12. They are essential for metabolism, brain function, and red blood cell formation.',
  why_use_it = 'B vitamins help reduce fatigue, support energy metabolism, and improve stress resilience. They also support mood by contributing to neurotransmitter production and help maintain cardiovascular health through homocysteine regulation.',
  how_does_it_work = 'B vitamins act as coenzymes in pathways that convert food into energy. B6, B9, and B12 are involved in neurotransmitter production and homocysteine metabolism, supporting brain and cardiovascular health. They also play key roles in DNA synthesis and cell division.',
  side_effects = 'B vitamins are generally well tolerated, with excess excreted in urine. Niacin may cause flushing at higher doses. Long-term high doses of B6 can rarely cause nerve symptoms. High folic acid intake may mask vitamin B12 deficiency.',
  risks_and_interactions = 'High doses may interact with medications, including statins, anticonvulsants, and some chemotherapy drugs. Use caution in liver or kidney disease and seek medical advice if taking regular medication.',
  who_might_benefit = 'People with fatigue, stress, low dietary intake, or increased nutritional needs, including older adults, vegans, and those with malabsorption.',
  evidence = 'Young et al. (2019), Nutrients, found in a systematic review and meta-analysis of nine studies that B vitamin supplementation did not improve mood or reduce depression scores versus placebo, suggesting no clear antidepressant effect; Stough et al. (2011), Human Psychopharmacology, reported that 90 days of high-dose B complex reduced personal strain and confusion or low mood in 60 adults with work stress; Lee et al. (2023), International Journal of Medical Sciences, found in 40 healthy young adults that 28 days of B complex increased treadmill time to exhaustion by about 3.3 minutes and lowered lactate and ammonia; Idris et al. (2025), International Journal of Biological Research, reported lower fatigue and better daily functioning in chronic fatigue syndrome; Chavarro et al. (2008), American Journal of Epidemiology, linked multivitamin use with roughly 30-40% lower ovulatory infertility risk in 18,555 women; Bazzano et al. (2010), JAMA Internal Medicine, found homocysteine fell about 25% in eight randomized trials but major cardiovascular outcomes and mortality did not improve. Overall evidence is mixed, with some benefits for stress, endurance, and fatigue but limited support for mood or cardiovascular outcomes, and several studies were small or observational.',
  evidence_score = 53,
  how_to_use = 'Typical dose: 50-100 mg of a B complex daily. Timing: Taken with breakfast or lunch.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 50-100 mg of a B complex daily. Timing: Taken with breakfast or lunch.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 100,
    'per_intake_min_value', 50,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'B Complex Vitamins'
  and status = 'approved';

update public.supplements
set
  description = 'A supplement of the essential amino acids leucine, isoleucine, and valine that is used to support exercise recovery and muscle maintenance.',
  what_is_it = 'BCAAs are three essential amino acids - leucine, isoleucine, and valine - that the body cannot produce and must obtain from food or supplements. They are metabolized mainly in muscle tissue and are commonly sold in a 2:1:1 ratio.',
  why_use_it = 'BCAAs are used to reduce exercise-related muscle damage and soreness, support muscle protein synthesis and recovery, help preserve muscle mass during calorie restriction, and may improve some aspects of athletic performance.',
  how_does_it_work = 'BCAAs stimulate muscle protein synthesis through the mTOR pathway, especially via leucine, and may reduce muscle protein breakdown. They can also compete with tryptophan at the blood-brain barrier to lower serotonin and reduce central fatigue, while helping decrease markers of muscle damage and providing energy during prolonged exercise.',
  side_effects = 'Generally safe and well tolerated. High doses may cause gastrointestinal discomfort, nausea, or fatigue. BCAAs may affect blood sugar, so people with diabetes should use caution.',
  risks_and_interactions = 'May interfere with diabetes medications and Parkinson''s medication levodopa. Not suitable for people with branched-chain ketoaciduria (maple syrup urine disease). Consult a healthcare provider if pregnant, breastfeeding, or managing chronic conditions.',
  who_might_benefit = 'Athletes doing resistance or high-intensity training, people with delayed onset muscle soreness, those on calorie-restricted diets trying to preserve muscle, endurance athletes, and older adults at risk of muscle loss.',
  evidence = 'Doma et al. (2021) in European Journal of Sport Science reviewed 25 randomized trials in 479 people and found BCAAs lowered indirect muscle damage markers 24-48 hours after hard exercise but did not reliably improve strength; ranked 16th of 20 for strength enhancing supplements. Manaf et al. (2021) in Journal of Science and Medicine in Sport reported in a randomized, double-blind, crossover trial of 18 recreational cyclists that BCAAs during long cycling reduced 20 km time-trial time and perceived exertion versus placebo; ranked 21st of 26 for endurance enhancing supplements. Fedewa et al. (2019) in International Journal of Vitamin and Nutrition Research pooled 8 randomized trials and found BCAAs clearly reduced delayed onset muscle soreness versus placebo, though performance recovery was not well tested; ranked 2nd of 9 for exercise recovery supplements.',
  evidence_score = 59,
  how_to_use = 'Typical dose is 5-20 g/day in a 2:1:1 leucine:isoleucine:valine ratio. Take before, during, or immediately after exercise, and use consistently for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g/day',
    'flags', jsonb_build_array('ratio_2:1:1'),
    'confidence', 0.95,
    'source_text', 'Typical dose 5-20 g/day in a 2:1:1 leucine:isoleucine:valine ratio.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 20,
    'per_intake_min_value', 5,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'BCAAs (Branched-Chain Amino Acids)'
  and status = 'approved';

update public.supplements
set
  description = 'A nitrate-rich juice that may improve exercise endurance and help lower blood pressure.',
  what_is_it = 'Beetroot juice is a natural source of dietary nitrates that the body converts into nitric oxide, and it also contains antioxidants such as betalains and polyphenols that support cardiovascular health.',
  why_use_it = 'It is used to improve exercise performance, especially endurance and stamina, and may also increase oxygen efficiency, enhance strength and power, and help lower blood pressure in some people.',
  how_does_it_work = 'Dietary nitrates are converted into nitric oxide, which relaxes blood vessels, improves blood flow, enhances oxygen delivery to muscles, reduces the energy cost of exercise, and supports endothelial function.',
  side_effects = 'Generally safe, but some people may experience stomach discomfort, headache, or beeturia, a harmless reddish color in urine. Starting with smaller amounts may improve tolerance.',
  risks_and_interactions = 'Beetroot juice may lower blood pressure, so caution is needed if taking antihypertensive medications or if prone to low blood pressure. It may also interact with medications affecting blood flow.',
  who_might_benefit = 'Endurance and strength athletes, people with high blood pressure, and those looking to support cardiovascular function may benefit.',
  evidence = 'Poon et al. (2025), Sports Medicine, found in meta-analyses of randomized trials with over 2,600 participants that nitrate supplements, mainly beetroot juice, improved time to exhaustion, distance covered, muscular endurance, and peak and mean power, with the most reliable benefits in high-intensity continuous efforts; ranked 1st of 25 for endurance enhancing supplements, with limitations that benefits were less consistent for short sprints and very long events. Benjamin et al. (2022), Frontiers in Nutrition, pooled 7 trials in people with hypertension and found beetroot juice lowered systolic blood pressure by 5 mmHg versus placebo, with stronger clinic than 24-hour effects and no significant diastolic benefit; ranked 5th of 20 for blood pressure control supplements. Alasmari et al. (2024), International Journal of Chronic Obstructive Pulmonary Disease, reported that daily nitrate-rich beetroot juice for 12 weeks improved blood vessel function and slightly improved blood flow and artery stiffness in people with COPD, with resting heart rate unchanged; ranked 9th of 18 for cardiovascular health supplements.',
  evidence_score = 85,
  how_to_use = 'Typical intake is around 250 ml daily, providing 400-600 mg nitrates. For performance, take it 2-3 hours before exercise. Consistent use may provide additional benefits.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'ml',
    'flags', jsonb_build_array('daily intake', 'performance timing noted', 'nitrate content provided'),
    'confidence', 0.93,
    'source_text', 'Around 250 ml daily, providing 400-600 mg nitrates. For performance: Take 2-3 hours before exercise.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 250,
    'per_intake_min_value', 250,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Beetroot Juice (Dietary Nitrates)'
  and status = 'approved';

update public.supplements
set
  description = 'Berberine is a plant-derived supplement used mainly to support blood sugar control and metabolic health.',
  what_is_it = 'Berberine is a plant-derived alkaloid found in herbs such as barberry, goldenseal, and Oregon grape. It has a long history of use in traditional medicine and is now widely used as a supplement for metabolic health. Berberine is one of the most studied natural compounds for blood sugar control and ranked 1st out of 27 supplements in its category.',
  why_use_it = 'Berberine is used to support blood sugar control, improve insulin sensitivity, and aid weight management. It may also help lower LDL cholesterol and triglycerides, and support cardiovascular and liver health.',
  how_does_it_work = 'Berberine activates AMPK, a key regulator of cellular energy balance. This increases glucose uptake, reduces liver glucose production, improves insulin sensitivity, and promotes fat metabolism. It may also influence gut microbiota and cholesterol metabolism.',
  side_effects = 'Berberine is generally well tolerated. Common side effects include nausea, diarrhea, constipation, and abdominal discomfort, especially at higher doses. Taking it with meals and starting with a lower dose may improve tolerance.',
  risks_and_interactions = 'Berberine may enhance the effects of diabetes medications, increasing the risk of low blood sugar. It can also interact with blood pressure medications, anticoagulants, and immunosuppressants. Avoid use in pregnancy or breastfeeding.',
  who_might_benefit = 'Individuals with insulin resistance, type 2 diabetes, metabolic syndrome, high cholesterol, or fatty liver.',
  evidence = 'Xie et al. (2022), Frontiers in Pharmacology, found berberine lowered fasting glucose, post-meal glucose, and HbA1c in people with type 2 diabetes without increasing hypoglycemia, and it ranked 1st out of 27 for blood sugar control, though the summary does not provide trial count or major limitations. Asbaghi et al. (2020), Clinical Nutrition ESPEN, reported that in 10 randomized studies in adults with metabolic problems, berberine reduced BMI, body weight, and waist size, with stronger effects in women with obesity and use longer than 12 weeks, ranking 4th out of 22 for weight management, though the evidence is limited by the small study set. Lu et al. (2022), Journal of Inflammation Research, found berberine lowered CRP and TNF-alpha in people with metabolic syndrome or related disorders but did not clearly change IL-1beta, ranking 4th out of 38 for anti-inflammatory supplements, with effects appearing targeted to high-risk metabolic states.',
  evidence_score = 88,
  how_to_use = 'Typical dose is 500 mg taken 2-3 times daily with meals. Consistent use over several weeks is recommended for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.98,
    'source_text', 'Typical dose: 500 mg taken 2-3 times daily with meals.',
    'parser_method', 'manual',
    'per_intake_max_value', 500,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 2
  ),
  dose_scoring_profile_json = null
where name = 'Berberine'
  and status = 'approved';

update public.supplements
set
  description = 'A natural fiber-like compound from yeast, mushrooms, oats, and barley that is mainly used to support immune health.',
  what_is_it = 'Beta-glucans are natural polysaccharides found in the cell walls of yeast, mushrooms, oats, and barley. The most studied forms come from yeast and fungi and are commonly used to support immune health.',
  why_use_it = 'Beta-glucans are used to strengthen immune function, reduce the frequency and severity of respiratory infections, and support recovery during periods of stress or intense exercise. They may also provide modest benefits for energy, mood, and cardiovascular health.',
  how_does_it_work = 'Beta-glucans activate immune cells such as macrophages and natural killer cells, improving the body''s defence against infections. They help regulate immune responses and may reduce excessive inflammation. Cereal-derived beta-glucans can also support cholesterol balance and vascular health.',
  side_effects = 'Beta-glucans are generally well tolerated. Some people may experience mild bloating, gas, or changes in bowel habits, especially when starting. Introduce gradually to improve tolerance.',
  risks_and_interactions = 'Use caution if taking immunosuppressive medications or with autoimmune conditions, as beta-glucans may alter immune activity. Those with gluten sensitivity should choose certified gluten-free products when using oat or barley sources.',
  who_might_benefit = 'Individuals prone to infections, athletes under heavy training stress, older adults, and those seeking general immune and cardiovascular support may benefit.',
  evidence = 'Evidence is strongest for immune support and moderate for energy and mood. Dharsono et al. (2019), Journal of the American College of Nutrition, found that 900 mg/day of yeast beta-glucan for 16 weeks in 299 adults who often caught colds made early cold symptoms milder but did not reduce infection frequency; ranked 5th of 19 for immune health. Muroya et al. (2025), European Journal of Clinical Nutrition, reported in a systematic review and meta-analysis of 16 randomized trials in 1,449 people that beta-glucan reduced fatigue and improved vigor and mood over 10 days to 16 weeks; ranked 2nd of 21 for energy. Talbott et al. (2012), Journal of the American College of Nutrition, found that 250 mg/day of yeast beta-glucan for 12 weeks improved mood and reduced tiredness in 77 stressed women; ranked 8th of 18 for mood. A 2024 pilot crossover trial in the Canadian Journal of Physiology and Pharmacology found no meaningful blood pressure benefit from 4 g/day of oat beta-glucan for 4 weeks; ranked 19th of 20 for blood pressure, with limited generalizability and short duration.',
  evidence_score = 81,
  how_to_use = 'Typical dose: 250-900 mg daily of yeast-derived beta-glucans with meals. Use consistently for several weeks for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('daily', 'with meals', 'yeast-derived'),
    'confidence', 0.95,
    'source_text', 'Typical dose: 250-900 mg daily of yeast-derived beta-glucans with meals',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 900,
    'per_intake_min_value', 250,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Beta-Glucans'
  and status = 'approved';

update public.supplements
set
  description = 'A water-soluble B vitamin that helps the body metabolize fats, carbohydrates, and proteins and is often used for hair, skin, and nail support.',
  what_is_it = 'Biotin, also known as vitamin B7, is a water-soluble B vitamin essential for metabolism. It acts as a cofactor for enzymes involved in processing fats, carbohydrates, and proteins. It also plays a role in maintaining healthy hair, skin, and nails. Biotin is one of the most popular beauty supplements, but the evidence is strongest for those with an underlying deficiency rather than the general population.',
  why_use_it = 'Biotin is commonly used to support hair strength, reduce brittle nails, and improve skin health. It also contributes to energy metabolism and supports normal neurological and glucose function.',
  how_does_it_work = 'Biotin functions as a coenzyme for carboxylase enzymes involved in fatty acid synthesis, gluconeogenesis, and amino acid metabolism. It supports keratin production, which helps maintain the structure of hair and nails, and also influences cellular function and gene expression.',
  side_effects = 'Biotin is very well tolerated with no known toxicity at typical doses.',
  risks_and_interactions = 'Higher doses can interfere with blood test results, including thyroid and cardiac markers. The main concern is interference with laboratory tests, even at moderate doses. It is recommended to stop biotin at least 48-72 hours before testing. No significant drug interactions are commonly reported, but inform healthcare providers before any testing.',
  who_might_benefit = 'Individuals with biotin deficiency, those with brittle nails or hair concerns, and people with increased nutritional needs may benefit.',
  evidence = 'Evidence is mixed and strongest for deficiency states: Yelich et al. (2024) in a narrative review of controlled human data found only one randomized, double-blind trial in women with diffuse hair loss where biotin 10 mg/day for 4 weeks did not improve hair growth or scalp oil versus placebo, and ranked biotin 11th of 11 for hair health; Upadhyay et al. (2024) in the International Journal of Research in Dermatology reported that a 56-day placebo-controlled trial of SesZen Bio, a 0.5% natural biotin supplement, improved wrinkles, fine lines, moisture, elasticity, and skin tone in adults with mild skin aging, but biotin''s specific role was unclear and it ranked 17th of 20 for skin health; Zhang et al. (2022) in Frontiers in Nutrition found in 5 trials with 445 people with type 2 diabetes that biotin 1.5-15 mg/day for up to 90 days lowered total cholesterol and triglycerides and may improve fasting glucose in those with high lipids and obesity, but effects in healthy people were not proven and it ranked 23rd of 26 for cholesterol support; Almasi et al. (2024) in Heliyon reported improved maze performance in a rat model of Alzheimer''s disease, but this was animal data and ranked 24th of 24 for cognitive support; Hemmati et al. (2013) in the Journal of the American College of Nutrition found that 15 mg/day for 3 months in 70 adolescents with type 1 diabetes lowered HbA1c and fasting glucose and improved lipids with no reported side effects, ranking 18th of 27 for blood sugar control.',
  evidence_score = 47,
  how_to_use = 'Typical dose: 0.5-2.5 mg daily. Higher doses may be used in specific cases but should be guided by a healthcare professional. Stop biotin at least 48-72 hours before blood testing.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 0.5-2.5 mg daily.',
    'parser_method', 'direct_range_per_day',
    'per_intake_max_value', 2.5,
    'per_intake_min_value', 0.5,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Biotin (Vitamin B7)'
  and status = 'approved';

update public.supplements
set
  description = 'A plant oil from black currant seeds that provides essential fatty acids such as GLA and ALA.',
  what_is_it = 'Black currant seed oil is a plant oil extracted from the seeds of Ribes nigrum. It is rich in essential fatty acids, including gamma-linolenic acid (GLA) and alpha-linolenic acid (ALA), which support inflammation balance and overall health. It is one of the richest plant sources of GLA, a fatty acid involved in regulating inflammatory responses.',
  why_use_it = 'It is used to support immune function, skin health, and joint comfort, and may also help maintain healthy cholesterol and cardiovascular function as part of a balanced lifestyle.',
  how_does_it_work = 'GLA is converted into compounds that help regulate inflammation, supporting skin, joints, and blood vessels. ALA contributes to omega-3 fatty acid pathways, supporting vascular function and lipid balance.',
  side_effects = 'It is generally well tolerated, though some people may experience mild digestive symptoms such as bloating or nausea. Taking it with food may improve tolerance. As an oil, it contributes additional calories.',
  risks_and_interactions = 'Black currant seed oil may have mild blood-thinning and blood pressure-lowering effects. Use caution with anticoagulants, antiplatelet drugs, or antihypertensives, and seek medical advice if taking regular medication.',
  who_might_benefit = 'Individuals seeking support for inflammation balance, skin hydration, joint comfort, or cardiovascular health may benefit, particularly those with low omega-3 intake.',
  evidence = 'Evidence is limited and mixed but suggests possible benefits for immune and lipid outcomes: Wu et al. 1999, American Journal of Clinical Nutrition, found that 40 adults aged 65 and over taking black currant seed oil for 2 months moderately boosted certain immune responses, improved T cell activity, and lowered an inflammatory substance with no reported side effects, ranked 12th of 19 for immune health; Tahvonen et al. 2005, Journal of Nutritional Biochemistry, found that healthy women taking 3 g daily for 4 weeks lowered LDL cholesterol more than fish oil and increased apoA-I, ranked 20th of 26 for cholesterol support, but the overall evidence base is small and the findings are not definitive.',
  evidence_score = 41,
  how_to_use = 'Typical dose is 500-2,000 mg daily, taken with meals. Consistent use over several weeks is recommended for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Typical dose: 500-2,000 mg daily, taken with meals.',
    'parser_method', 'direct_range_extraction',
    'per_intake_max_value', 2000,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Black Currant Seed Oil'
  and status = 'approved';

update public.supplements
set
  description = 'Black seed oil is an extract from Nigella sativa seeds that is used for inflammation, immune support, sleep, stress, and skin health.',
  what_is_it = 'Black seed oil is extracted from the seeds of Nigella sativa, also known as black cumin or kalonji. It contains active compounds such as thymoquinone and has been used traditionally for immune, metabolic, and skin health.',
  why_use_it = 'Black seed oil is used for anti-inflammatory support, immune function, and stress resilience. It may also help support sleep and is commonly used for skin conditions such as dryness or irritation.',
  how_does_it_work = 'Thymoquinone and related compounds have antioxidant and anti-inflammatory effects, helping regulate immune responses and reduce inflammatory signalling. It may also influence pathways involved in stress and sleep regulation.',
  side_effects = 'Black seed oil is generally well tolerated. Some people may experience mild gastrointestinal discomfort, headache, or allergic reactions. Product strength can vary, so choosing a standardised preparation is recommended.',
  risks_and_interactions = 'Use caution if taking medications for blood pressure, blood sugar, or blood thinning, as effects may be enhanced. Those with autoimmune conditions or on immunosuppressive therapy should seek medical advice before use.',
  who_might_benefit = 'Individuals seeking immune support, mild anti-inflammatory effects, stress reduction, or skin health support may benefit.',
  evidence = 'Evidence is moderate overall. Tavakoly et al. (2019), Clinical Nutrition ESPEN, a systematic review and meta-analysis of 7 randomized studies in 439 adults, found Nigella sativa seeds or oil at 1-3 g/day lowered CRP by about 0.55 mg/L versus placebo, with stronger effects from oil and in people with BMI 30 or higher; it ranked 11th of 38 for anti-inflammatory supplements, with heterogeneity and mixed populations limiting certainty. Mohan et al. (2023), Frontiers in Nutrition, a randomized double-blind placebo-controlled study in 72 healthy adults with poor sleep and stress, found 200 mg/day of black cumin oil for 90 days improved immune markers and also improved sleep and stress; it ranked 12th of 19 for immune health, but the sample was small and used a proprietary extract. Das et al. (2022), Complementary Therapies in Medicine, in 15 healthy adults with sleep loss, found 200 mg/day of thymoquinone-rich black cumin oil for 35 days improved deep and REM sleep and reduced anxiety, stress, and cortisol; it ranked 7th of 11 for sleep support and 7th of 15 for stress relief, but the study was very small. Ahmed et al. (2014), Journal of Clinical and Experimental Investigations, in 60 adults with mild to moderate psoriasis, found 12 weeks of black seed treatment improved plaques, especially when capsules and ointment were combined, with no major side effects; it ranked 16th of 20 for skin health, but the trial was modest in size and used multiple treatment forms.',
  evidence_score = 61,
  how_to_use = 'Typical dose is 1-2 teaspoons daily with meals, or 100-200 mg of a standardized extract. For sleep, take in the evening. Topical use may be applied once or twice daily to the skin.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardized_extract', 'per_intake_estimate'),
    'confidence', 0.74,
    'source_text', 'Typical dose: 1-2 teaspoons daily with meals, or 100-200 mg of a standardised extract. For sleep: Take in the evening. Topical use: Apply once or twice daily to the skin.',
    'parser_method', 'direct_text_parse',
    'per_intake_max_value', 200,
    'per_intake_min_value', 100,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Black Seed Oil'
  and status = 'approved';

update public.supplements
set
  description = 'Boswellia is a resin extract from Boswellia serrata that is used mainly to support joint comfort and reduce inflammation.',
  what_is_it = 'Boswellia, also known as Indian frankincense, is a resin extract from the Boswellia serrata tree. It contains active compounds called boswellic acids, particularly AKBA, which are known for their anti-inflammatory effects. Boswellia is ranked 1st out of 14 joint health supplements and works without blocking the COX pathway, which may reduce gastrointestinal side effects.',
  why_use_it = 'Boswellia is used to support joint health, reduce pain and stiffness, and improve mobility, especially in osteoarthritis. It may also help in inflammatory conditions like rheumatoid arthritis, asthma, and IBS.',
  how_does_it_work = 'Boswellic acids inhibit enzymes involved in inflammation, particularly 5-lipoxygenase, reducing leukotriene production. They also help regulate inflammatory pathways and protect joint cartilage from breakdown.',
  side_effects = 'Boswellia is generally well tolerated. Mild side effects may include stomach discomfort, nausea, diarrhea, or heartburn. Taking it with food may improve tolerance.',
  risks_and_interactions = 'Avoid during pregnancy and breastfeeding due to potential uterine effects. Use caution with anti-inflammatory drugs, blood thinners, and medications processed by the liver.',
  who_might_benefit = 'Individuals with joint pain, osteoarthritis, or inflammatory conditions may benefit, particularly those seeking alternatives to traditional anti-inflammatory medications.',
  evidence = 'Yu et al. (2020), BMC Complementary Medicine and Therapy, systematic review and meta-analysis in 545 people with osteoarthritis found Boswellia extract reduced pain, stiffness, and improved joint function versus placebo after at least about four weeks; ranked 1st out of 14 for joint health supplements, with the main limitation that benefits were based on pooled trials. Majeed et al. (2024), Frontiers in Pharmacology, double-blind randomized three-arm multicenter placebo-controlled trial in 105 people with new knee osteoarthritis found 300-600 mg/day of standardized Boswellia quickly reduced pain, improved joint scores by about 69-74%, and lowered inflammation markers within about five days; ranked 8th out of 38 for anti-inflammatory supplements, with short follow-up and a relatively small sample.',
  evidence_score = 82,
  how_to_use = 'Typical dose is 300-900 mg daily of a standardized extract, divided into 2-3 doses with meals. Use consistently for several weeks for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardized_extract', 'divided_doses', 'with_meals'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 300-900 mg daily of a standardised extract, divided into 2-3 doses with meals.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 450,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 2
  ),
  dose_scoring_profile_json = null
where name = 'Boswellia (Boswellia serrata)'
  and status = 'approved';

update public.supplements
set
  description = 'A synthetic research peptide studied mainly in animals for possible tissue repair and injury recovery.',
  what_is_it = 'BPC-157 is a synthetic peptide derived from a protein found in human gastric juice. It is not naturally present in this isolated form and has been developed for research purposes. It is not approved for medical use and is banned in professional sport.',
  why_use_it = 'It is used experimentally to support healing of tendon, ligament, and muscle injuries, reduce inflammation, and promote tissue repair. It is often discussed in athletic and recovery settings.',
  how_does_it_work = 'BPC-157 appears to promote blood vessel formation and tissue repair through effects on nitric oxide pathways and growth signalling. It may support collagen production and reduce inflammatory activity, contributing to healing processes.',
  side_effects = 'Human safety data are limited. Reported effects include mild irritation at injection sites, but overall safety in humans is not established.',
  risks_and_interactions = 'BPC-157 is not approved for human use and is banned by professional sports organisations. Product quality may vary due to lack of regulation. Avoid use in pregnancy or breastfeeding and seek medical advice before considering use. Use carries unknown risks due to lack of clinical studies.',
  who_might_benefit = 'Primarily discussed among athletes or individuals with injuries, though use remains experimental and unregulated.',
  evidence = 'Evidence is weak and mostly preclinical: Lee et al. (2021) in Alternative Therapies in Health and Medicine reported a one-year review of 16 people with knee pain in which most improved after intra-articular BPC-157 injections, but it was a very small uncontrolled review and ranked 15th of 15 for joint health; Chen et al. (2023) in Research in Pharmaceutical Sciences found dose-dependent increases in rat muscle cell migration and repair-related proteins without actual strength or performance testing, ranked 20th of 20 for strength enhancing supplements; Chang et al. (2011) in Journal of Applied Physiology showed improved tendon fibroblast outgrowth, collagen synthesis, and biomechanical recovery in a rat Achilles tendon model, but all evidence was from animal studies and it ranked 5th of 5 for injury recovery.',
  evidence_score = 8,
  how_to_use = 'There is no established safe or approved dosing in humans. Any use is experimental and carries unknown risks.',
  recommended_dose_status = 'missing',
  recommended_dose_json = null,
  dose_scoring_profile_json = null
where name = 'BPC-157'
  and status = 'approved';

update public.supplements
set
  description = 'A pineapple-derived enzyme supplement used mainly for inflammation, swelling, and recovery support.',
  what_is_it = 'Bromelain is a group of enzymes extracted from pineapple, particularly the stem and fruit. It has proteolytic activity, meaning it helps break down proteins, and is used for its anti-inflammatory and tissue-supporting properties.',
  why_use_it = 'Bromelain is used to reduce inflammation, swelling, and pain, particularly after injury or surgery. It may support recovery, improve circulation, and help with conditions such as osteoarthritis and sinus inflammation.',
  how_does_it_work = 'Bromelain breaks down proteins involved in inflammation and fluid accumulation. It helps reduce inflammatory signalling, supports fibrinolysis, and may improve blood flow by reducing platelet aggregation and tissue swelling.',
  side_effects = 'Bromelain is generally well tolerated. Some people may experience mild gastrointestinal discomfort, nausea, or diarrhea. Taking it on an empty stomach improves absorption, though starting with a lower dose may improve tolerance.',
  risks_and_interactions = 'Bromelain may increase bleeding risk, so caution is needed with anticoagulants or before surgery. Allergic reactions can occur, particularly in those allergic to pineapple or related substances. Avoid in pregnancy or breastfeeding.',
  who_might_benefit = 'Individuals recovering from surgery or injury, those with joint pain or inflammation, and people seeking natural anti-inflammatory support may benefit.',
  evidence = 'Michelini et al. (2019), Lymphology, studied 52 people with stage I-II lymphedema and found bromelain 100 mg daily with Melilotus and Rutin for 6 months reduced pitting, limb size, and tissue thickness without side effects; it ranked 6th of 7 for lymphatic/swelling support. Pereira et al. (2023), Clinical Nutrition ESPEN, reviewed 7 trials and found bromelain 99.9-1,200 mg/day for 3-16 weeks usually lowered inflammatory markers such as IL-6, IL-8, TNF-alpha, and CRP, though results varied and mild stomach side effects were reported in 11 people with 2 dropouts; it ranked 24th of 38 for anti-inflammatory supplements.',
  evidence_score = 38,
  how_to_use = 'Typical dose: 80-400 mg taken 2-3 times daily on an empty stomach. Use consistently for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 80-400 mg taken 2-3 times daily on an empty stomach.',
    'parser_method', 'direct_text_parse',
    'per_intake_max_value', 400,
    'per_intake_min_value', 80,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 2
  ),
  dose_scoring_profile_json = null
where name = 'Bromelain'
  and status = 'approved';

update public.supplements
set
  description = 'An evergreen shrub used to support circulation and reduce leg swelling.',
  what_is_it = 'Butcher''s broom is an evergreen shrub native to Europe, traditionally used for vascular health. Its active compounds, ruscogenins, are steroidal saponins that support blood vessel function and circulation.',
  why_use_it = 'Butcher''s broom is used to improve venous tone, reduce leg swelling, and support conditions such as varicose veins, chronic venous insufficiency, and haemorrhoids. It may also help reduce fluid retention and support lymphatic drainage.',
  how_does_it_work = 'Ruscogenins stimulate receptors in blood vessel walls, causing mild vasoconstriction and improving venous tone. They help reduce capillary leakage, support lymphatic flow, and reduce inflammation within the vascular system.',
  side_effects = 'It is generally well tolerated. Some people may experience mild gastrointestinal symptoms such as nausea, stomach discomfort, or diarrhea. Taking it with food may improve tolerance.',
  risks_and_interactions = 'Butcher''s broom may raise blood pressure, so caution is advised with antihypertensive medications. It may also affect mineral absorption. Avoid use during pregnancy or breastfeeding and seek medical advice if you have cardiovascular conditions.',
  who_might_benefit = 'Individuals with leg swelling, varicose veins, venous insufficiency, or haemorrhoids may benefit, particularly those with circulation-related symptoms.',
  evidence = 'Vanscheidt et al. (2002), Phlebology, studied 166 women with chronic venous insufficiency and found that 12 weeks of Ruscus aculeatus extract significantly reduced leg volume, ankle and leg circumference, and heavy, tense leg symptoms versus placebo, with very good tolerability; this was ranked 4th of 7 for lymphatic/swelling support, but the evidence is limited to a single trial in this summary.',
  evidence_score = 42,
  how_to_use = 'Typical dose: 300-600 mg daily of a standardised extract. Consistent use over several weeks is recommended for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardised extract'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 300-600 mg daily of a standardised extract.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 600,
    'per_intake_min_value', 300,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Butcher''s Broom (Ruscus aculeatus)'
  and status = 'approved';

update public.supplements
set
  description = 'A natural stimulant that can improve alertness, focus, and physical performance.',
  what_is_it = 'Caffeine is a natural stimulant found in coffee, tea, cacao, and other plants, and is also available in supplement form. It acts on the central nervous system to increase alertness, energy, and focus.',
  why_use_it = 'Caffeine is used to improve concentration, reaction time, and mental performance. It is also widely used to enhance physical performance, including strength and endurance, and may support short-term energy and mood.',
  how_does_it_work = 'Caffeine blocks adenosine receptors in the brain, reducing feelings of fatigue and increasing alertness. This leads to increased release of neurotransmitters such as dopamine and noradrenaline. It also enhances muscle activation and can increase metabolic rate.',
  side_effects = 'Common side effects include jitteriness, anxiety, palpitations, digestive upset, and insomnia, especially at higher doses. Regular use may lead to tolerance and withdrawal symptoms such as headaches and fatigue.',
  risks_and_interactions = 'Caution is needed in people with cardiovascular conditions, anxiety disorders, or sleep problems. Caffeine may interact with medications affecting the heart, blood pressure, or mood. Avoid high intake, especially later in the day.',
  who_might_benefit = 'Students, professionals, and athletes seeking improved focus, alertness, and performance may benefit when used appropriately.',
  evidence = 'McLellan et al. (2016), Neuroscience & Biobehavioral Reviews, found that low to moderate caffeine doses about 40-300 mg reliably improve alertness, vigilance, attention, and reaction time in rested and sleep-restricted adults, though memory and higher-order executive effects were less consistent; ranked 1st of 9 for concentration enhancing. Grgic et al. (2018), Nutrients, reviewed 10 randomized studies with 149 participants and found caffeine about 4.7-6 mg/kg slightly increased upper body strength and muscle power, with small to medium benefits especially in capsules and men; ranked 6th of 20 for strength enhancing. Grgic et al. (2022), Nutrients, combined 23 trials and found caffeine 3-9 mg/kg improved running time to exhaustion and race times slightly, with stronger effects in longer endurance events; ranked 2nd of 25 for endurance enhancing. Tabrizi et al. (2019), Clinical Nutrition, meta-analyzed randomized trials and found caffeine promoted weight loss, BMI reduction, and body fat decrease, with higher intake associated with greater reductions versus placebo; ranked 3rd of 22 for weight management. Irwin et al. (2020), Neuroscience & Biobehavioral Reviews, reviewed 45 studies and found caffeine improves attention, reaction time, physical tasks, and driving performance in sleep-deprived people; ranked 1st of 21 for energy enhancing. Sherman et al. (2016), Frontiers in Psychology, found 180 mg caffeine improved memory recall by about 30% in 60 young adults during the early morning but not in the afternoon; ranked 11th of 20 for memory enhancing. Shen et al. (2021), Brain and Behavior, reviewed 13 studies including a meta-analysis of 5 trials and found caffeine during exercise improved correct responses and response speed but not simple reaction time or inhibitory control; ranked 2nd of 24 for cognitive support.',
  evidence_score = 93,
  how_to_use = 'Typical dose is 50-300 mg taken 30-60 minutes before activity. Avoid use within 6-8 hours of bedtime.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 50-300 mg, taken 30-60 minutes before activity.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 300,
    'per_intake_min_value', 50,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Caffeine'
  and status = 'approved';

update public.supplements
set
  description = 'An essential mineral that supports bone, muscle, nerve, and heart function.',
  what_is_it = 'Calcium is an essential mineral and the most abundant in the body, with most stored in bones and teeth. It is available as supplements such as calcium carbonate and calcium citrate and supports bone, muscle, and nerve function.',
  why_use_it = 'Calcium is used to maintain bone density, reduce fracture risk, and prevent osteoporosis. It also supports muscle contraction, nerve signalling, and may help reduce symptoms of premenstrual syndrome.',
  how_does_it_work = 'Calcium forms the structural framework of bones and teeth. It also plays a key role in muscle contraction, nerve transmission, and hormone regulation. It helps maintain normal cellular and cardiovascular function.',
  side_effects = 'Calcium is generally well tolerated. Some people may experience constipation, bloating, or gas, particularly with calcium carbonate. High doses may increase the risk of kidney stones.',
  risks_and_interactions = 'Taking smaller, divided doses may improve absorption. Calcium can reduce absorption of certain medications, including antibiotics and thyroid treatments, so doses should be spaced apart. Excess intake may affect absorption of other minerals. Avoid very high daily intake.',
  who_might_benefit = 'Older adults, postmenopausal women, and individuals with low dietary calcium intake or increased fracture risk may benefit.',
  evidence = 'Li (2025), Acta Ortopédica Brasileira, reviewed 23 trials in 70,837 older adults and found calcium supplements at about 1,000-1,200 mg/day slightly lowered total and non-vertebral fractures by around 7%, with greater benefit in higher-dose or higher-risk groups; ranked 3rd of 10 for bone health, with the main limitation that benefits were modest. Haidari et al. (2017), Obstetrics & Gynecology Science, studied 66 women with PMS and found 500 mg/day calcium for 2 months reduced overall PMS severity versus placebo, including anxiety, low mood, emotional swings, bloating, and physical symptoms, with benefits lasting two cycles afterward; ranked 12th of 13 for female hormone balance, with a small sample size.',
  evidence_score = 67,
  how_to_use = 'Typical intake is 1,000-1,200 mg daily from diet and supplements combined. Take in divided doses of 500 mg or less. Calcium carbonate should be taken with food; calcium citrate can be taken anytime.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical intake: 1,000-1,200 mg daily from diet and supplements combined. Take in divided doses of 500 mg or less.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 500,
    'per_intake_min_value', 500,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Calcium'
  and status = 'approved';

update public.supplements
set
  description = 'Capsaicin is the spicy compound in chili peppers that is used to support metabolism and weight management.',
  what_is_it = 'Capsaicin is the compound responsible for the heat in chili peppers. It is used in foods, topical pain treatments, and supplements aimed at supporting metabolism and weight management.',
  why_use_it = 'Capsaicin is used to increase energy expenditure, support fat burning, and reduce appetite. It may help with weight management when combined with diet and exercise.',
  how_does_it_work = 'Capsaicin activates receptors involved in heat and pain sensation, which stimulates the sympathetic nervous system. This increases metabolic rate, promotes fat oxidation, and may enhance feelings of fullness through effects on appetite-regulating hormones.',
  side_effects = 'Common side effects include burning sensations, heartburn, and gastrointestinal discomfort, especially at higher doses. Tolerance often develops with regular use. Taking it with food and starting with a low dose may improve tolerance.',
  risks_and_interactions = 'Capsaicin may worsen reflux or stomach irritation and should be avoided in those with sensitivity or ulcers. It may interact with anticoagulant medications. Avoid high-dose use during pregnancy and seek medical advice if taking regular medication.',
  who_might_benefit = 'Individuals seeking appetite control or metabolic support for weight management, particularly those in a calorie deficit.',
  evidence = 'Zhang et al. (2023), British Journal of Nutrition, systematic review and meta-analysis of 15 randomized trials in 762 overweight and obese participants found capsaicin supplements produced small reductions in BMI, body weight of about half a kilogram, and waist size versus placebo, with somewhat stronger effects in obese people and in studies lasting 6-12 weeks; ranked 9th of 22 for weight management supplements, with modest effects and trial limitations.',
  evidence_score = 36,
  how_to_use = 'Typical dose: 2-6 mg daily, taken with meals. Consistent use over several weeks is needed for noticeable effects.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 2-6 mg daily, taken with meals.',
    'parser_method', 'explicit_range_per_day_to_per_intake',
    'per_intake_max_value', 6,
    'per_intake_min_value', 2,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Capsaicin'
  and status = 'approved';

update public.supplements
set
  description = 'A slow-digesting milk protein that provides a gradual release of amino acids, often used before bed or between meals.',
  what_is_it = 'Casein is a slow-digesting milk protein that makes up most of the protein in milk. Unlike whey, it forms a gel in the stomach, leading to a gradual release of amino acids over several hours. It is commonly used as a sustained protein source. Casein is often called the night-time protein because its slow digestion can keep muscles supplied with amino acids for up to 7 hours during sleep.',
  why_use_it = 'Casein is used to support muscle recovery, reduce muscle breakdown, and promote satiety. It is particularly useful overnight or between meals to maintain a steady supply of amino acids.',
  how_does_it_work = 'Casein forms a gel in the stomach, slowing digestion and absorption. This results in a steady release of amino acids into the bloodstream, helping maintain protein balance and reduce muscle breakdown over time.',
  side_effects = 'Casein is generally well tolerated but may cause bloating or digestive discomfort in some individuals. It may not be well tolerated in lactose-sensitive individuals.',
  risks_and_interactions = 'Avoid in milk protein allergy. It may affect absorption of certain medications if taken at the same time. No major drug interactions are reported at typical doses.',
  who_might_benefit = 'Athletes, individuals aiming to build or maintain muscle, and those seeking improved satiety or overnight recovery may benefit.',
  evidence = 'Snijders et al. 2019, Frontiers in Nutrition, reported that 27.5 g protein before sleep for 12 weeks increased muscle size and strength versus a non-protein drink in healthy young men doing weight training; this was ranked 12th of 20 for strength enhancing supplements and was limited by the mixed protein formulation. Kim et al. 2020, Journal of Exercise Nutrition & Biochemistry, reviewed randomized trials and found that 40-48 g casein before sleep after evening weight training improved overnight muscle protein building, protein balance, soreness, and later recovery; this was ranked 6th of 9 for exercise recovery supplements and was limited by review-level evidence. Pal et al. 2010, British Journal of Nutrition, found in overweight or obese adults that casein did not improve long-term calorie intake or body weight versus whey and was ranked 20th of 22 for weight management supplements, limiting support for satiety and weight loss claims.',
  evidence_score = 70,
  how_to_use = 'Typical dose is 20-40 g per serving. Best taken before bed or between meals. It can be mixed with water or milk.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 20-40 g per serving.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 40,
    'per_intake_min_value', 20,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Casein Protein'
  and status = 'approved';

update public.supplements
set
  description = 'CBD is a non-intoxicating cannabis-derived compound used mainly for stress, mood, and sleep support.',
  what_is_it = 'Cannabidiol (CBD) is a non-intoxicating compound derived from the cannabis plant, usually extracted from low-THC hemp. It is available as oils, capsules, gummies, and topicals, and is used for stress, mood, and sleep support. Unlike THC, CBD does not produce a high.',
  why_use_it = 'CBD is used to promote relaxation, reduce stress, and support sleep. It may help individuals who feel tense, anxious, or have difficulty winding down, and may also support discomfort linked to stress or poor sleep.',
  how_does_it_work = 'CBD interacts with the endocannabinoid system, which helps regulate mood, stress, sleep, and pain. It influences serotonin pathways and the balance between calming and excitatory signals in the brain, supporting relaxation and emotional stability.',
  side_effects = 'CBD is generally well tolerated. Possible side effects include drowsiness, dry mouth, digestive changes, and fatigue, especially at higher doses. Starting with a low dose and increasing gradually may improve tolerance.',
  risks_and_interactions = 'CBD can interact with medications processed by the liver, including anticoagulants, antidepressants, and antiepileptics. It may increase sedation when combined with other calming medications. Seek medical advice if taking regular medication.',
  who_might_benefit = 'Adults experiencing stress, anxiety, or sleep difficulties may benefit, particularly those seeking a non-intoxicating option.',
  evidence = 'Han et al. (2024), Journal of Affective Disorders, reviewed 8 trials in 316 people and found CBD had a clear and meaningful effect in lowering clinical anxiety symptoms in generalized anxiety, social anxiety, and PTSD, supporting stress relief; ranked 2nd of 15, with evidence strongest for anxiety and limited by the trial mix. Narayan et al. (2024), Journal of Clinical Sleep Medicine, studied 30 people with primary insomnia using 150 mg nightly and found CBD was similar to placebo for most sleep measures but improved well-being and sleep efficiency by about 7% after 2 weeks; ranked 11th of 11, with modest effects. Pinto et al. (2023), Frontiers in Psychiatry, studied 35 people with bipolar depression and found 150-300 mg/day for 8 weeks reduced depression scores more than placebo with higher response and remission rates; ranked 11th of 18, with small sample size.',
  evidence_score = 62,
  how_to_use = 'Typical starting dose: 5-10 mg once or twice daily, adjusted gradually based on response. For sleep: take in the evening 1-2 hours before bed.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Typical starting dose: 5-10 mg once or twice daily, adjusted gradually based on response. For sleep: Take in the evening 1-2 hours before bed.',
    'parser_method', 'manual',
    'per_intake_max_value', 10,
    'per_intake_min_value', 5,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'CBD (Cannabidiol)'
  and status = 'approved';

update public.supplements
set
  description = 'A coffee-derived plant compound used to support blood sugar, blood pressure, and modest weight management.',
  what_is_it = 'Chlorogenic acid is a plant compound found in coffee beans, apples, and various fruits, and it is the main active component in green coffee bean extract.',
  why_use_it = 'It is used to support healthy blood sugar levels and improve insulin sensitivity, and it may also help with blood pressure control and modest weight management.',
  how_does_it_work = 'It reduces glucose production in the liver and slows carbohydrate absorption in the gut, which may limit post-meal blood sugar spikes; it may also improve insulin function and influence fat metabolism.',
  side_effects = 'It is generally well tolerated, but some people may experience mild gastrointestinal discomfort, nausea, or diarrhoea. Green coffee extracts may also contain small amounts of caffeine, which can affect sensitive individuals.',
  risks_and_interactions = 'It may enhance the effects of diabetes medications and lower blood sugar further, and it may interact with blood pressure medications. Use caution in pregnancy and seek medical advice if taking regular medication.',
  who_might_benefit = 'Individuals with prediabetes, insulin resistance, or those seeking support for blood sugar and metabolic health may benefit.',
  evidence = 'Evidence is moderate to good across three gold-rated meta-analyses: Nikpayam et al. (2019) in Clinical Nutrition ESPEN reviewed six adult trials and found green coffee extract lowered fasting blood glucose and doses above 400 mg/day improved insulin resistance, though fasting insulin did not clearly change; Onakpoya et al. (2015) in Journal of Human Hypertension pooled 5 randomized trials with 364 participants and found chlorogenic acid reduced systolic blood pressure by 4.3 mmHg and diastolic blood pressure by 3.7 mmHg in adults with mild hypertension; Kanchanasurakit et al. (2023) in Systematic Reviews combined 3 randomized trials with 103 participants and found green bean coffee extract providing at least 500 mg chlorogenic acids reduced body weight by 1.30 kg versus placebo, with limitations including small trial sizes and limited study numbers.',
  evidence_score = 73,
  how_to_use = 'Typical dose is 200-400 mg daily, often taken before meals to help control post-meal blood sugar levels.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 200-400 mg daily. Timing: Often taken before meals to help control post-meal blood sugar levels.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 400,
    'per_intake_min_value', 200,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Chlorogenic Acid / Green Coffee Bean Extract'
  and status = 'approved';

update public.supplements
set
  description = 'A cartilage-derived supplement used mainly to support joint comfort and function in osteoarthritis.',
  what_is_it = 'Chondroitin is a natural component of cartilage and connective tissue, typically derived from animal cartilage and sold as a supplement for joint health, especially osteoarthritis.',
  why_use_it = 'It is used to reduce joint pain and stiffness, improve mobility, support cartilage integrity, and may help slow cartilage breakdown and reduce reliance on pain medicines in some people.',
  how_does_it_work = 'Chondroitin helps maintain cartilage structure by attracting water into the tissue for better cushioning and shock absorption, while also reducing cartilage-degrading enzymes and modulating inflammation in joints.',
  side_effects = 'Generally well tolerated. Mild side effects may include nausea, heartburn, or diarrhoea. Benefits often take several weeks to become noticeable.',
  risks_and_interactions = 'May increase bleeding risk when combined with anticoagulants such as warfarin. Some products may contain allergens depending on the source. Avoid use during pregnancy unless advised.',
  who_might_benefit = 'People with osteoarthritis, joint pain, or reduced mobility, particularly in the knees or hips, may benefit.',
  evidence = 'Honvo et al. (2019), Clinical Drug Investigation, reviewed 18 placebo-controlled trials and found chondroitin sulfate produced a moderate reduction in knee osteoarthritis pain and a large improvement in function, though results varied by study size, product brand, and study quality; it was ranked 5th out of 14 for joint health supplements. Wan et al. (2017), International Journal of Clinical and Experimental Medicine, reported in high-cholesterol mice that squid-cartilage chondroitin sulfate reduced weight gain, blood and liver fats, and liver enlargement and improved antioxidant markers, but this was animal research only and ranked 26th out of 26 for cholesterol support supplements.',
  evidence_score = 65,
  how_to_use = 'Typical dose is 1,200 mg daily, often divided into smaller doses. Use consistently for at least 8-12 weeks before assessing effectiveness.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.98,
    'source_text', 'Typical dose: 1,200 mg daily, often divided into smaller doses.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 1200,
    'per_intake_min_value', 1200,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Chondroitin'
  and status = 'approved';

update public.supplements
set
  description = 'A highly absorbable chromium supplement used mainly to support blood sugar control and metabolic health.',
  what_is_it = 'Chromium picolinate is a highly absorbable form of chromium, an essential trace mineral involved in glucose and lipid metabolism. It is commonly used as a supplement to support blood sugar control and metabolic health. Chromium is one of the few trace minerals with a direct role in insulin signalling, and even small deficiencies can impair the body''s ability to regulate blood sugar effectively.',
  why_use_it = 'It is used to support healthy blood glucose levels, improve insulin sensitivity, reduce carbohydrate cravings, and provide general metabolic support and weight management support.',
  how_does_it_work = 'Chromium enhances insulin signalling, improving glucose uptake into cells. It supports the activity of proteins involved in insulin function, helping regulate blood sugar levels and reduce fluctuations.',
  side_effects = 'Generally well tolerated. Some people may experience mild headache, gastrointestinal discomfort, or sleep disturbance.',
  risks_and_interactions = 'Chromium may enhance the effects of diabetes medications, increasing the risk of low blood sugar. It may also interact with certain medications such as corticosteroids. Use caution in pregnancy and seek medical advice if taking medication.',
  who_might_benefit = 'Individuals with insulin resistance, prediabetes, or carbohydrate cravings may benefit, particularly when combined with lifestyle changes.',
  evidence = 'Suksomboon et al. (2014), Journal of Clinical Pharmacy and Therapeutics, a systematic review and meta-analysis ranked 9th of 27 for blood sugar control supplements, found that across 25 trials in people with diabetes chromium supplements mainly as chromium picolinate reduced HbA1c by about 0.55% and fasting blood sugar by about 1.15 mmol/L versus placebo, with stronger effects at doses of 200 micrograms per day or more, though study quality and consistency varied. Talab et al. (2020), Clinical Nutrition Research, a randomized clinical trial ranked 21st of 26 for cholesterol support supplements, found that 400 micrograms per day for 8 weeks lowered total and LDL cholesterol and improved insulin resistance in 41 adults with type 2 diabetes, but did not change triglycerides, HDL, fasting blood sugar, body weight, or BMI.',
  evidence_score = 61,
  how_to_use = 'Typical dose is 200-400 micrograms daily. Use consistently for several weeks to assess effects.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'micrograms',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 200-400 micrograms daily.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 400,
    'per_intake_min_value', 200,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Chromium Picolinate'
  and status = 'approved';

update public.supplements
set
  description = 'A cinnamon bark supplement used mainly to support blood sugar and metabolic health.',
  what_is_it = 'Cinnamon extract is derived from the bark of Cinnamomum trees and contains active compounds such as cinnamaldehyde and polyphenols. It is commonly used as a supplement to support blood sugar and metabolic health. Ceylon cinnamon is preferred for long-term supplementation because Cassia cinnamon contains coumarin, which can be harmful in large amounts.',
  why_use_it = 'It is used to help maintain healthy blood glucose levels, improve insulin sensitivity, and support cardiovascular health. It may also provide antioxidant benefits and support lipid balance.',
  how_does_it_work = 'Cinnamon enhances insulin signalling, improving glucose uptake into cells. It also slows carbohydrate digestion and gastric emptying, helping reduce post-meal blood sugar spikes. It may additionally support lipid metabolism.',
  side_effects = 'Generally well tolerated, but some people may experience mild gastrointestinal discomfort or mouth irritation.',
  risks_and_interactions = 'Cassia cinnamon contains coumarin, so Ceylon cinnamon is preferred for long-term use. Cinnamon may enhance the effects of diabetes medications, increasing the risk of low blood sugar. It may also interact with anticoagulants. Use caution in pregnancy and seek medical advice if taking medication.',
  who_might_benefit = 'Individuals with prediabetes, type 2 diabetes, or those seeking support for blood sugar and cardiovascular health may benefit.',
  evidence = 'Moridpour et al. (2023), Phytotherapy Research, a dose-response meta-analysis of 24 randomized trials in adults with type 2 diabetes, found cinnamon lowered fasting blood sugar and HbA1c but not fasting insulin; it ranked 3rd of 27 for blood sugar control supplements, with evidence limited by trial variability. Zhang et al. (2022), Complementary Therapies in Medicine, a meta-analysis of 12 randomized trials in 773 adults with metabolic syndrome or related disorders, found cinnamon reduced total cholesterol, LDL cholesterol, and triglycerides but not HDL cholesterol consistently; it ranked 7th of 26 for cholesterol support supplements, with weaker effects in European and American groups.',
  evidence_score = 74,
  how_to_use = 'Typical dose: 120 mg to 2 g daily, taken with meals. Consistent use over several weeks is recommended.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Typical dose: 120 mg to 2 g daily, taken with meals.',
    'parser_method', 'range_extraction',
    'per_intake_max_value', 2000,
    'per_intake_min_value', 120,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Cinnamon Extract'
  and status = 'approved';

update public.supplements
set
  description = 'Citicoline is a brain-support supplement that may help memory, focus, attention, and mood.',
  what_is_it = 'Citicoline (cytidine diphosphate-choline) is a naturally occurring compound involved in brain cell membrane formation. It acts as a precursor to phosphatidylcholine and supports overall brain health and cognitive function.',
  why_use_it = 'Citicoline is used to support memory, focus, and attention. It may also help improve mental clarity, support mood, and provide neuroprotective effects, particularly in age-related cognitive decline.',
  how_does_it_work = 'Citicoline increases production of phosphatidylcholine, helping maintain and repair brain cell membranes. It also raises levels of neurotransmitters such as acetylcholine and dopamine, supporting memory, attention, and mood.',
  side_effects = 'Citicoline is generally well tolerated. Some people may experience mild side effects such as headache, insomnia, or digestive discomfort. Taking it earlier in the day may help avoid sleep disturbance.',
  risks_and_interactions = 'Citicoline may interact with medications affecting acetylcholine or dopamine. Use caution in neurological conditions and seek medical advice if taking regular medication.',
  who_might_benefit = 'Older adults with memory concerns, individuals seeking improved focus, and those wanting cognitive and mood support may benefit.',
  evidence = 'Bermejo et al. (2023), Journal of Alzheimer''s Disease Reports, found citicoline often improved cognition and memory in mild cognitive impairment, especially with vascular issues, but attention results were mixed and one 12-month trial showed no overall difference versus placebo; McGlade et al. (2012), Journal of Attention Disorders, reported 250-500 mg/day for 28 days improved sustained attention in healthy adult women; Brown et al. (2012), Journal of Affective Disorders, found 2,000 mg/day for 12 weeks improved depression scores in adults with bipolar or unipolar depression and methamphetamine dependence but did not change memory or methamphetamine use; Nakazaki et al. (2021), Journal of Nutrition, found 500 mg daily for 12 weeks improved episodic and overall memory in older adults with age-related memory problems. Overall evidence is strong for memory and moderate for attention and mood, with study populations and outcomes varying across trials.',
  evidence_score = 75,
  how_to_use = 'Typical dose: 250-500 mg daily. Take in the morning or early afternoon. Higher doses may be used under supervision.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 250-500 mg daily.',
    'parser_method', 'manual',
    'per_intake_max_value', 500,
    'per_intake_min_value', 250,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Citicoline (CDP-Choline)'
  and status = 'approved';

update public.supplements
set
  description = 'A combination of L-citrulline and malic acid used mainly to support exercise performance and recovery.',
  what_is_it = 'Citrulline malate is a combination of the amino acid L-citrulline and malic acid. It is commonly used as a performance supplement to support exercise capacity, blood flow, and recovery. Citrulline takes a clever route to boost nitric oxide - rather than supplying arginine directly, it bypasses the liver''s breakdown of arginine, resulting in higher blood levels than arginine supplementation itself.',
  why_use_it = 'Citrulline malate is used to improve muscular endurance, increase repetitions during resistance training, and reduce fatigue. It may also support recovery and reduce muscle soreness after exercise.',
  how_does_it_work = 'Citrulline increases arginine levels in the blood, leading to greater nitric oxide production and improved blood flow to muscles. Malate may support energy production, helping reduce fatigue and improve exercise performance.',
  side_effects = 'Citrulline malate is generally well tolerated. Some individuals may experience mild gastrointestinal discomfort at higher doses. Taking it with water and starting at a lower dose may improve tolerance.',
  risks_and_interactions = 'No major drug interactions are reported at typical doses. Product quality can vary, so choosing a reputable supplement is important.',
  who_might_benefit = 'Athletes and active individuals seeking improved endurance, performance, and recovery may benefit, particularly during high-intensity or resistance training.',
  evidence = 'Aguiar et al. (2021), Journal of Dietary Supplements, a systematic review and meta-analysis of randomized controlled trials, found that citrulline malate did not significantly improve upper or lower body strength in resistance-trained adults and ranked it 17th out of 20 for strength enhancing supplements, with limited trial numbers. Vårvik et al. (2021), International Journal of Sport Nutrition and Exercise Metabolism, a systematic review and meta-analysis of eight small high-quality trials in 137 people, found that 6-8 g taken 40-60 minutes before training increased total reps to failure by about 6% and ranked it 10th out of 26 for endurance enhancing supplements, though endurance benefits were not clear.',
  evidence_score = 42,
  how_to_use = 'Typical dose is 6-8 g taken about 60 minutes before exercise. Regular use may further support performance.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 6-8 g taken about 60 minutes before exercise.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 8,
    'per_intake_min_value', 6,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Citrulline Malate'
  and status = 'approved';

update public.supplements
set
  description = 'An edible coconut-derived oil that is high in saturated fat and is sometimes used as a quick energy source.',
  what_is_it = 'Coconut oil is an edible oil extracted from the flesh of mature coconuts. It is rich in saturated fats, particularly medium-chain triglycerides (MCTs), which are metabolized differently from other dietary fats.',
  why_use_it = 'It is used as a quick source of energy, especially in low-carbohydrate or ketogenic diets, and is sometimes used for possible cholesterol effects, although the overall cardiovascular impact is uncertain.',
  how_does_it_work = 'The MCTs in coconut oil are rapidly absorbed and sent to the liver, where they are quickly used for energy or converted into ketones, providing a faster energy source than longer-chain fats.',
  side_effects = 'Generally well tolerated in small amounts. Larger intakes may cause nausea, cramping, or loose stools. It is calorie-dense and high in saturated fat.',
  risks_and_interactions = 'High intake may increase LDL cholesterol and cardiovascular risk, especially if it replaces healthier unsaturated fats. People with heart disease or high cholesterol should use caution and seek medical advice.',
  who_might_benefit = 'People following low-carbohydrate or ketogenic diets, or those needing a concentrated energy source, may benefit when used in moderation.',
  evidence = 'Valente et al. (2018), European Journal of Nutrition, studied 15 women with excess body fat and found that 25 mL virgin coconut oil with breakfast did not change resting metabolism, fat burning, or post-meal calorie burning versus extra virgin olive oil and did not worsen blood fats or blood sugar; it was ranked 18th of 21 for energy enhancing supplements, with the limitation of a small sample. Maiti et al. (2024), Journal of Integrative Cardiology, studied 150 people with dyslipidaemia and found that 8 weeks of 1,000 mg/day virgin coconut oil plus atorvastatin raised HDL cholesterol more than atorvastatin alone and improved several heart risk indexes, but lowered LDL and total cholesterol slightly less; it was ranked 24th of 26 for cholesterol support supplements, with no reported side effects and the limitation that it was an add-on trial.',
  evidence_score = 38,
  how_to_use = 'Typical use is 1-2 teaspoons daily, as part of cooking or added to foods. Increase gradually if needed.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'teaspoon',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Typical use: 1-2 teaspoons daily, as part of cooking or added to foods.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 2,
    'per_intake_min_value', 1,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Coconut Oil'
  and status = 'approved';

update public.supplements
set
  description = 'A fat-soluble antioxidant that helps the body make energy and is often used for heart health, fatigue, and statin support.',
  what_is_it = 'Coenzyme Q10 (CoQ10) is a fat-soluble compound found in the body, especially in energy-demanding tissues like the heart and muscles. It helps produce energy and acts as an antioxidant, and supplement forms include ubiquinone and ubiquinol.',
  why_use_it = 'It is used to support heart health, improve energy levels, reduce fatigue, help people taking statins, support exercise performance, and may also contribute to skin and fertility health.',
  how_does_it_work = 'CoQ10 supports mitochondrial energy production by helping generate ATP for cellular function. It also acts as an antioxidant, helping protect cells from oxidative stress and supporting blood vessel function.',
  side_effects = 'CoQ10 is generally well tolerated. Mild side effects may include nausea, digestive discomfort, or headache. Taking it with food, especially a fat-containing meal, can improve absorption.',
  risks_and_interactions = 'CoQ10 may lower blood pressure and can interact with antihypertensive medications. It may also affect anticoagulants such as warfarin, so medical advice is recommended if taking regular medication.',
  who_might_benefit = 'People with cardiovascular concerns, those experiencing fatigue, statin users, and active individuals seeking performance support may benefit.',
  evidence = 'Evidence is strongest for cardiovascular health, where Xu et al. (2024) in BMC Cardiovascular Disorders found that 32 trials in 3,763 people with heart failure showed improved pumping ability, walking distance, deaths, hospital stays, symptom severity, and BNP levels, ranked 2nd of 18 with a gold rating. Additional silver-rated evidence includes Yang et al. (2025) in Respiratory Physiology & Neurobiology, where 41 healthy adults taking 200 mg ubiquinol daily for 14 days at high altitude maintained performance and cardiorespiratory fitness, Zhang et al. (2025) in Frontiers in Cardiovascular Medicine, where a meta-analysis found modest systolic blood pressure reductions especially below 200 mg/day and with longer use, Žmitek et al. (2017) in BioFactors, where 12 weeks of 50 or 150 mg/day improved wrinkle depth and skin smoothness in 33 adults, Lafuente et al. (2013) in Journal of Assisted Reproduction and Genetics, where three trials in 296 men improved semen CoQ10, sperm count, and sperm movement but not pregnancy outcomes, and Ramadaha et al. (2023) in SCOPE Journal of Microbiology and Public Health, where a review of 10 studies found small anti-ageing skin benefits with unclear methods and dosing.',
  evidence_score = 73,
  how_to_use = 'Typical dose is 100-300 mg daily taken with meals, and consistent use over several weeks is recommended for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 100-300 mg daily, taken with meals.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 300,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Coenzyme Q10 (Ubiquinol)'
  and status = 'approved';

update public.supplements
set
  description = 'Hydrolysed collagen peptides are animal-derived protein fragments used to support skin, joints, bones, hair, nails, and connective tissue.',
  what_is_it = 'Collagen peptides are hydrolysed forms of collagen derived from animal connective tissues such as skin and bone. They provide amino acids like glycine and proline that support the structure of skin, joints, and bones. Collagen is the most abundant protein in the body, but production naturally declines from your mid-20s, making supplementation increasingly relevant as we age.',
  why_use_it = 'Collagen peptides are used to support joint health, improve skin hydration and elasticity, and strengthen hair and nails. They may also help support bone density and recovery in active individuals.',
  how_does_it_work = 'Collagen peptides supply key amino acids that stimulate collagen production in the body. They support cartilage structure, improve skin hydration and elasticity, and contribute to bone strength and connective tissue repair.',
  side_effects = 'Collagen is generally well tolerated, though mild bloating or digestive discomfort can occur. Consistent use is needed for noticeable effects.',
  risks_and_interactions = 'Marine-based products may cause reactions in those with fish or shellfish allergies. No major drug interactions are known. Use caution in pregnancy and ensure products are sourced from reputable manufacturers to minimise contamination risks.',
  who_might_benefit = 'Individuals with joint discomfort, those seeking skin and anti-ageing support, athletes, and older adults concerned with bone and connective tissue health may benefit.',
  evidence = 'Evidence is strongest for joint and skin outcomes: Simental-Mendía et al. (2024), Clinical and Experimental Rheumatology, found in 11 trials with 870 people with knee osteoarthritis that oral collagen improved pain and daily function versus placebo without more side effects, ranked 6th of 14 for joint health; Danessa et al. (2025), Indian Journal of Dermatology, Venereology and Leprology, found in multiple randomized trials that oral collagen modestly but consistently improved skin hydration and elasticity after 8-12 weeks, ranked 2nd of 20 for skin health; Glynnis et al. (2015), Journal of Cosmetic Dermatology, reported in 60 women with thinning hair that a marine protein-collagen supplement improved hair count and appearance with no side effects, ranked 9th of 11 for hair health; Myung et al. (2025), American Journal of Medicine, found pooled improvements in skin measures but concluded evidence is not solid because higher-quality and non-industry-funded trials showed no benefit, ranked 8th of 15 for anti-ageing; Konig et al. (2018), Nutrients, found 5 g/day specific collagen peptides plus calcium and vitamin D improved bone density and markers in 131 postmenopausal women, ranked 8th of 10 for bone health; and Zdzieblik et al. (2015), British Journal of Nutrition, found 15 g/day with resistance training improved strength and body composition in 53 elderly men with sarcopenia, ranked 13th of 20 for strength enhancing, with overall limitations including modest trial sizes and some mixed findings.',
  evidence_score = 61,
  how_to_use = 'Typical dose: 5-10 g daily. Take consistently for at least 8-12 weeks for best results. Taking it with vitamin C may support collagen production.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 5-10 g daily.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 10,
    'per_intake_min_value', 5,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Collagen Peptides (Hydrolysed Collagen)'
  and status = 'approved';

update public.supplements
set
  description = 'A fatty acid supplement used for modest support of fat loss and body composition.',
  what_is_it = 'Conjugated linoleic acid (CLA) is a fatty acid found naturally in meat and dairy products. As a supplement, it is usually derived from plant oils such as safflower oil and is used to support body composition.',
  why_use_it = 'CLA is used to support fat loss, improve body composition, and help preserve lean muscle mass. It is often included in weight management programmes alongside diet and exercise.',
  how_does_it_work = 'CLA influences fat metabolism by increasing fat oxidation and reducing fat storage in cells. It may also affect enzymes involved in fat uptake and energy use, contributing to modest changes in body composition.',
  side_effects = 'CLA is generally well tolerated but may cause mild gastrointestinal symptoms such as nausea, diarrhea, or stomach discomfort. Effects are typically modest and require consistent use over several weeks.',
  risks_and_interactions = 'CLA may affect insulin sensitivity, so caution is advised in people with diabetes. High doses may impact liver enzymes. Avoid use during pregnancy or breastfeeding and seek medical advice if taking regular medication.',
  who_might_benefit = 'Individuals aiming for modest fat loss, improved body composition, or preservation of lean muscle during calorie restriction may benefit.',
  evidence = 'Whigham et al. (2007), American Journal of Clinical Nutrition, reviewed 18 randomized controlled trials and found that about 3.2 g/day of CLA produced only a small reduction in body fat, roughly 0.6 kg over 12 weeks; the supplement was ranked 13th out of 22 for weight management supplements, and the main limitation was that the real-world effect was modest.',
  evidence_score = 30,
  how_to_use = 'Typical dose is around 3-3.2 g daily, taken in divided doses with meals. Consistent use for at least 8-12 weeks is recommended.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Around 3-3.2 g daily, taken in divided doses with meals.',
    'parser_method', 'manual',
    'per_intake_max_value', 1.6,
    'per_intake_min_value', 1.5,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 2
  ),
  dose_scoring_profile_json = null
where name = 'Conjugated Linoleic Acid (CLA)'
  and status = 'approved';

update public.supplements
set
  description = 'A traditional medicinal fungus used as a supplement for energy, endurance, and fatigue support.',
  what_is_it = 'Cordyceps is a fungus used in traditional Chinese medicine, commonly available as a supplement in mycelium or extract form. Standardised extracts such as Cs-4 are often used for consistency and quality. Cordyceps has been used in Tibetan and Chinese medicine for centuries as a tonic for energy and endurance, and modern research is beginning to explore the mechanisms behind these traditional claims.',
  why_use_it = 'Cordyceps is used to support energy levels, reduce fatigue, and improve exercise performance. It may enhance endurance, oxygen utilisation, and overall physical capacity.',
  how_does_it_work = 'Cordyceps supports energy production by enhancing mitochondrial function and ATP synthesis. It may improve oxygen use and blood flow, while also influencing energy metabolism and reducing fatigue during exercise.',
  side_effects = 'Cordyceps is generally well tolerated. Some individuals may experience mild gastrointestinal discomfort, insomnia, or restlessness, particularly at higher doses. Starting with a lower dose may improve tolerance.',
  risks_and_interactions = 'Cordyceps may interact with anticoagulants and stimulant substances. Use caution if taking medications or combining with caffeine. Avoid use during pregnancy and seek medical advice if needed.',
  who_might_benefit = 'Athletes, active individuals, and those experiencing fatigue or low energy may benefit, particularly for endurance and recovery support.',
  evidence = 'Hirsch et al. (2016), Journal of Dietary Supplements, reported that in 28 healthy adults, 4 g/day Cordyceps militaris in a mushroom blend for 3 weeks increased VO2max by 4.8 ml/kg/min and time to exhaustion by about 70 seconds versus placebo, with smaller gains after one week; the supplement was ranked 16th out of 26 for endurance enhancing supplements, but the evidence is limited by the small sample and use of a blend rather than Cordyceps alone.',
  evidence_score = 39,
  how_to_use = 'Typical dose: 1-3 g daily of a standardised extract. Consistent use over several weeks is recommended for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('standardised_extract'),
    'confidence', 0.86,
    'source_text', 'Typical dose: 1-3 g daily of a standardised extract.',
    'parser_method', 'manual',
    'per_intake_max_value', 3,
    'per_intake_min_value', 1,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Cordyceps (Cordyceps sinensis)'
  and status = 'approved';

update public.supplements
set
  description = 'A concentrated cranberry supplement used mainly to help prevent recurrent urinary tract infections.',
  what_is_it = 'Cranberry extract is a concentrated form of cranberry, standardized for proanthocyanidins (PACs), the compounds linked to urinary tract health. It is commonly taken as capsules or tablets rather than juice.',
  why_use_it = 'Cranberry extract is used to help prevent recurrent urinary tract infections and support bladder health. It is often taken by individuals prone to UTIs as a preventive option.',
  how_does_it_work = 'Cranberry PACs reduce the ability of bacteria, particularly E. coli, to adhere to the lining of the urinary tract. This helps bacteria be flushed out more easily, lowering the risk of infection.',
  side_effects = 'Generally well tolerated. Some people may experience mild stomach discomfort or diarrhea.',
  risks_and_interactions = 'High intake may increase kidney stone risk in susceptible individuals. Cranberry may interact with anticoagulants such as warfarin, potentially affecting bleeding risk. It should not be used as a treatment for active infections. Use caution if prone to kidney stones.',
  who_might_benefit = 'Individuals with recurrent urinary tract infections or those seeking to support urinary health may benefit.',
  evidence = 'Xiong et al. (2024), Frontiers in Nutrition, published a meta-analysis and systematic review of 10 trials showing cranberry products lowered repeat UTI risk by about 15%, with clearer benefit at at least 36 mg PACs daily for 12-24 weeks and about a 16% risk reduction in women; it was ranked 1st out of 7 for urinary health supplements, with the main limitation that benefit depended on adequate PAC dose and duration.',
  evidence_score = 78,
  how_to_use = 'Typical intake is at least 36 mg PACs daily, taken in one or two doses. Consistent use over several weeks is recommended for prevention.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg PACs',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'At least 36 mg PACs daily, taken in one or two doses.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 36,
    'per_intake_min_value', 18,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Cranberry Extract'
  and status = 'approved';

update public.supplements
set
  description = 'Creatine monohydrate is a well-studied supplement that helps replenish cellular energy, improving strength, power, recovery, and some aspects of cognition.',
  what_is_it = 'Creatine is a nitrogenous organic acid naturally synthesised in the body and found in muscle tissue. Creatine monohydrate is the gold standard form and the most extensively researched sports supplement. It increases intramuscular phosphocreatine stores, supporting rapid ATP regeneration.',
  why_use_it = 'It is used to enhance muscle strength and power output, improve high-intensity exercise performance and endurance, support muscle mass gains, enhance cognitive function and memory, support bone health and reduce fall risk in ageing, and provide anti-inflammatory and recovery benefits.',
  how_does_it_work = 'Creatine donates phosphate groups to ADP, rapidly regenerating ATP during high-intensity, short-duration activities. It delays fatigue onset, supports maximal strength, and may enhance muscle protein synthesis via mTOR activation. In the brain, it supports mitochondrial ATP production.',
  side_effects = 'Generally very well tolerated. Mild side effects include water retention of about 1-2 kg, gastrointestinal discomfort, and muscle cramping. A loading phase can accelerate saturation but is optional. Adequate hydration is important. Effects usually require 2-4 weeks without loading.',
  risks_and_interactions = 'May elevate creatinine levels, so kidney tests should be interpreted with caution. Avoid or use only with medical supervision in renal impairment or pre-existing kidney conditions. Generally safe in healthy individuals and no major drug interactions are noted.',
  who_might_benefit = 'Resistance-trained athletes, strength competitors, endurance athletes, older adults seeking muscle retention and fall prevention, vegetarians and vegans, individuals with memory issues, and those recovering from injury.',
  evidence = 'Evidence is strong across multiple uses. Gordji-nejad et al. (2024), Scientific Reports, found that a single 0.35 g/kg dose improved thinking speed and short-term memory during 21 hours of sleep deprivation, with effects peaking around 4 hours and lasting up to 9 hours; ranked 12th of 24 for cognitive support. Huang et al. (2025), Nutrients, a systematic review and meta-analysis, found creatine clearly increased muscle strength, especially in new trainees and with hard exercise, with 3-5 g/day performing well; ranked 1st of 20 for strength enhancement. Rawson et al. (2011), Nutrition, reported that about 2.3 g/day for 6 weeks improved fatigue resistance by 7-11% without weight gain; ranked 14th of 25 for endurance enhancement. Candow et al. (2022), Bone, a narrative review in older adults, found improved lean mass and strength and about 27% lower bone breakdown markers in older men without kidney or liver harm; ranked 5th of 15 for anti-ageing. Xu et al. (2024), Nutrients, a meta-analysis of 24 trials in about 1,000 adults found improved memory and thinking speed but not clear gains in overall cognition or executive function; ranked 6th of 20 for memory enhancement. Slankamenac et al. (2023), Journal of the International Society of Sports Nutrition, found 4 g/day for 6 months reduced fatigue and later improved breathlessness, pain, headaches, and concentration in 12 people with long COVID fatigue without serious side effects; ranked 10th of 21 for energy enhancement. Limitations include some small studies, mixed populations, and variable outcomes.',
  evidence_score = 90,
  how_to_use = 'Loading is optional: 20 g/day split as 5 g four times daily for 5-7 days, then 3-5 g/day maintenance. Without loading, take 3-5 g daily for 3-4 weeks. Take with carbohydrates or protein if desired, and use it consistently every day.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('loading_optional', 'maintenance', 'daily_use'),
    'confidence', 0.98,
    'source_text', 'Loading (optional): 20 g/day (5 g x 4) for 5-7 days, then 3-5 g/day maintenance. Without loading: 3-5 g daily for 3-4 weeks.',
    'parser_method', 'rule_based',
    'per_intake_max_value', 5,
    'per_intake_min_value', 3,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Creatine / Creatine Monohydrate'
  and status = 'approved';

update public.supplements
set
  description = 'A turmeric-derived supplement used mainly to reduce inflammation and support joint health.',
  what_is_it = 'Curcumin is the main active compound in turmeric, a spice derived from the Curcuma longa plant. It is commonly used as a supplement in standardised extracts, often combined with piperine to improve absorption.',
  why_use_it = 'Curcumin is used to reduce inflammation, support joint health, and improve mobility. It may also support brain, cardiovascular, and metabolic health, and is widely used for general anti-inflammatory support.',
  how_does_it_work = 'Curcumin reduces inflammation by modulating key signalling pathways and lowering production of inflammatory compounds. It also acts as an antioxidant, helping protect cells from oxidative stress.',
  side_effects = 'Curcumin is generally well tolerated, though some people may experience mild digestive discomfort. Absorption is low unless taken with piperine or dietary fat. Benefits typically develop over several weeks.',
  risks_and_interactions = 'Curcumin may increase the effects of anticoagulants and antiplatelet medications. It may also interact with diabetes medications. Avoid high doses in pregnancy and seek medical advice if taking medication.',
  who_might_benefit = 'Individuals with joint pain, chronic inflammation, or those seeking general health support may benefit.',
  evidence = 'Zhao et al. (2024), Journal of Ethnopharmacology, a Bayesian network meta-analysis of 23 randomized trials in over 2,000 people with knee osteoarthritis found curcumin reduced pain and overall joint symptom scores more than placebo with fewer digestive side effects; ranked 3rd out of 14 for joint health supplements, with evidence strongest for symptom relief rather than disease modification. Gorabi et al. (2021), Phytotherapy Research, an updated meta-analysis of 32 randomized controlled trials found curcumin lowered CRP by about 3.7 mg/L versus placebo, with best results at up to 1,000 mg daily for over 10 weeks in people with elevated inflammation; ranked 1st out of 38 for anti-inflammatory supplements, though study quality and dosing varied. Santos-Parker et al. (2017), Aging, in 39 healthy middle-aged and older adults, 2,000 mg daily for 12 weeks improved small artery function by 37% and blood vessel widening without major side effects; ranked 7th out of 18 for cardiovascular health supplements, but the trial was small.',
  evidence_score = 88,
  how_to_use = 'Typical dose: 500-2,000 mg daily of a standardised extract. Take with meals containing fat, ideally with piperine. Use consistently for several weeks for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardised_extract', 'with_food_preferred', 'absorption_enhancer_recommended'),
    'confidence', 0.95,
    'source_text', 'Typical dose: 500-2,000 mg daily of a standardised extract. Tip: Take with meals containing fat, ideally with piperine.',
    'parser_method', 'manual',
    'per_intake_max_value', 2000,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Curcumin (Turmeric Extract)'
  and status = 'approved';

update public.supplements
set
  description = 'A naturally occurring amino acid supplement marketed for testosterone support and performance, but with limited benefits in trained men.',
  what_is_it = 'D-aspartic acid (DAA) is a naturally occurring amino acid involved in hormone regulation. It is marketed as a supplement to support testosterone production and athletic performance. Despite being heavily marketed for testosterone support, clinical trials in trained men show little to no hormonal benefit - any strength gains appear to be independent of testosterone changes.',
  why_use_it = 'DAA is promoted to increase testosterone levels, support muscle growth, and improve strength and performance. However, evidence for these effects in healthy, trained individuals is limited.',
  how_does_it_work = 'DAA may stimulate the release of luteinising hormone, which signals testosterone production. In practice, the body appears to regulate this process tightly, limiting meaningful increases in testosterone in most individuals.',
  side_effects = 'DAA is generally well tolerated. Some people may experience mild gastrointestinal discomfort. Effects on testosterone are inconsistent, and many users may not notice significant benefits.',
  risks_and_interactions = 'No major drug interactions are known. Long-term effects on hormone regulation are unclear, so caution is advised with prolonged use.',
  who_might_benefit = 'Individuals with low baseline testosterone may see some benefit, though evidence is limited. It is less likely to benefit resistance-trained individuals with normal levels.',
  evidence = 'Willoughby et al. (2013), Nutrition, found that 28 days of D-aspartic acid with heavy resistance training did not improve body composition, strength, or serum hormones versus placebo in resistance-trained men; ranked 7th of 8 for testosterone enhancing supplements, with the limitation that training alone improved outcomes in both groups. LaMacchia et al. (2017), Der Pharmacia Lettre, reported that 3 g daily for 14 days improved squat and bench press strength in 15 trained men without increasing testosterone; ranked 15th of 20 for strength enhancing supplements, with the limitation of a small sample and short duration.',
  evidence_score = 43,
  how_to_use = 'Typical dose: 3-6 g daily. Assess effects after several weeks and discontinue if no benefit is observed.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 3-6 g daily.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 6,
    'per_intake_min_value', 3,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'D-Aspartic Acid (DAA)'
  and status = 'approved';

update public.supplements
set
  description = 'A simple sugar supplement used to support urinary tract health and help prevent recurrent urinary tract infections.',
  what_is_it = 'D-mannose is a naturally occurring simple sugar found in small amounts in fruits such as cranberries and apples. As a supplement, it is typically taken as a powder or capsule and is used to support urinary tract health.',
  why_use_it = 'D-mannose is used to help prevent recurrent urinary tract infections and support urinary comfort. It is commonly taken as a non-antibiotic option to reduce infection risk.',
  how_does_it_work = 'D-mannose is absorbed and excreted in urine, where it binds to bacteria such as E. coli. This prevents them from attaching to the urinary tract lining, allowing them to be flushed out more easily.',
  side_effects = 'Generally well tolerated. Some people may experience mild bloating, loose stools, or nausea, particularly at higher doses.',
  risks_and_interactions = 'D-mannose should not replace medical treatment for active or severe infections. People with diabetes or kidney disease should seek medical advice before use. Use caution in people with diabetes at higher intakes.',
  who_might_benefit = 'Individuals with recurrent uncomplicated urinary tract infections, particularly those triggered by specific factors, may benefit.',
  evidence = 'Harding et al. (2024), JAMA Internal Medicine, reported in a large blinded randomized clinical trial of 598 women with frequent UTIs that 2 g of D-mannose daily for 6 months did not prevent infections better than placebo, with similar UTI counts, symptoms, antibiotic use, and hospital visits in both groups; the supplement was ranked 5th out of 7 for urinary health supplements, and the main limitation was lack of demonstrated benefit despite the large trial.',
  evidence_score = 25,
  how_to_use = 'Typical dose: 1-2 g once or twice daily for prevention. At symptom onset: Higher short-term doses may be used. Consistent use over time may help reduce recurrence.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Typical dose: 1-2 g once or twice daily for prevention. At symptom onset: Higher short-term doses may be used.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 2,
    'per_intake_min_value', 1,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'D-Mannose'
  and status = 'approved';

update public.supplements
set
  description = 'A cruciferous-vegetable compound used to support estrogen metabolism and hormonal balance.',
  what_is_it = 'Diindolylmethane (DIM) is a compound formed during the digestion of cruciferous vegetables such as broccoli and cabbage. It is used as a supplement to support healthy estrogen metabolism and hormonal balance.',
  why_use_it = 'DIM is used to support estrogen balance, reduce symptoms associated with hormonal fluctuations, and promote overall hormonal health. It is commonly used in women experiencing symptoms linked to estrogen imbalance.',
  how_does_it_work = 'DIM influences enzymes involved in estrogen metabolism, promoting the production of less active forms of estrogen. It may also increase proteins that regulate circulating hormone levels, supporting hormonal balance.',
  side_effects = 'DIM is generally well tolerated. Some people may experience mild digestive discomfort or headache. Harmless darkening of urine can occur. Effects typically develop over several weeks.',
  risks_and_interactions = 'DIM may interact with hormone-related medications, including contraceptives and treatments for hormone-sensitive conditions. Use caution in pregnancy and seek medical advice if taking medication.',
  who_might_benefit = 'Women with symptoms of hormonal imbalance, such as bloating or breast tenderness, and those seeking hormonal support during perimenopause may benefit.',
  evidence = 'Thomson et al. (2017), Breast Cancer Research and Treatment, reported that in a randomized placebo-controlled trial of 98 women taking tamoxifen, 300 mg/day of DIM for 12 months increased the healthy estrogen metabolite ratio 3.2-fold and raised sex hormone binding globulin by 25 nmol/L with few side effects; the entry ranked 6th of 13 for female hormone balance supplements, but the evidence is limited by the specific tamoxifen-treated population.',
  evidence_score = 29,
  how_to_use = 'Typical dose: 100-200 mg daily, taken with meals. Consistent use over several weeks is recommended.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 100-200 mg daily, taken with meals.',
    'parser_method', 'manual',
    'per_intake_max_value', 200,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'DIM (Diindolylmethane)'
  and status = 'approved';

update public.supplements
set
  description = 'Echinacea is a flowering herb used mainly to support immune health and may help with colds when taken early.',
  what_is_it = 'Echinacea is a group of flowering plants traditionally used to support immune health. It is commonly sold as extracts, capsules, and teas, often made from Echinacea purpurea or Echinacea angustifolia.',
  why_use_it = 'It is used to support immune function and may help reduce the risk, duration, or severity of common colds when taken early. It is also used for general upper respiratory support.',
  how_does_it_work = 'Echinacea contains active compounds that may stimulate immune cells such as macrophages and natural killer cells. It may also influence signalling molecules involved in the body''s response to infection.',
  side_effects = 'Echinacea is generally well tolerated. Some people may experience mild digestive discomfort, nausea, or rash. Allergic reactions can occur, especially in people sensitive to related plants.',
  risks_and_interactions = 'Echinacea may interact with immunosuppressive medications and is not recommended in autoimmune conditions without medical advice. It may also affect certain liver enzymes involved in drug metabolism.',
  who_might_benefit = 'People seeking immune support, especially during cold and flu season or at the early onset of symptoms, may benefit.',
  evidence = 'Jawad et al. (2012), Evidence-Based Complementary and Alternative Medicine, reported in a 4-month randomized, double-blind, placebo-controlled trial in 755 people that continuous echinacea use was associated with fewer colds, fewer sick days, and less need for pain relievers than placebo, with stronger benefits in consistent users; it was ranked 6th out of 19 for immune health supplements. Aucoin et al. (2021), Current Research in Complementary and Alternative Medicine, found mixed evidence that echinacea may lower IL-6, IL-8, and TNF-alpha and raise IL-10, but study quality and methods were inconsistent, limiting confidence in anti-inflammatory effects; it was ranked 33rd out of 38 for anti-inflammatory supplements.',
  evidence_score = 55,
  how_to_use = 'Typical dose is 300-500 mg daily of a standardized extract. For acute use, start at symptom onset and continue for about 7-10 days.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardized_extract', 'daily_total'),
    'confidence', 0.86,
    'source_text', 'Typical dose: 300-500 mg daily of a standardised extract.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 500,
    'per_intake_min_value', 300,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Echinacea'
  and status = 'approved';

update public.supplements
set
  description = 'A dark purple Sambucus nigra fruit used mainly for immune support and early cold and flu symptom relief.',
  what_is_it = 'Elderberry is a dark purple fruit from the Sambucus nigra plant, traditionally used to support immune health. It is commonly available as syrups, capsules, lozenges, and standardised extracts.',
  why_use_it = 'Elderberry is used to support immune function and may help reduce the duration and severity of cold and flu symptoms when taken early. It is also used for general respiratory support.',
  how_does_it_work = 'Elderberry contains anthocyanins and polyphenols with antioxidant and anti-inflammatory effects. These compounds may help limit viral activity and support the body''s immune response.',
  side_effects = 'Elderberry is generally well tolerated. Some people may experience mild gastrointestinal discomfort or nausea. Raw or unripe berries should not be consumed, but commercial products are processed and safe.',
  risks_and_interactions = 'Elderberry may interact with immunosuppressive medications and should be used with caution in autoimmune conditions. Avoid during pregnancy or breastfeeding and seek medical advice if taking medication.',
  who_might_benefit = 'Individuals seeking immune support or those experiencing early cold or flu symptoms may benefit.',
  evidence = 'Tiralongo et al. (2016), Journal of International Medical Research, found in 312 long-haul air travellers that elderberry extract shortened cold recovery by about 2 days and reduced symptom scores by roughly 40% versus placebo, ranked 7th of 19 for immune health, with the limitation that this applies to a specific traveller population. Schön et al. (2021), Food & Function, reported laboratory antiviral and immunomodulatory effects including lower TNF-alpha and IFN-gamma, higher IL-4 and IL-10, and up to 95% reduced viral infectivity, ranked 28th of 38 for anti-inflammatory supplements, with the limitation that these were lab findings only.',
  evidence_score = 59,
  how_to_use = 'Typical dose is 300-500 mg daily of a standardised extract. For acute use, start at symptom onset and continue for 7-10 days.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Typical dose: 300-500 mg daily of a standardised extract.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 500,
    'per_intake_min_value', 300,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Elderberry'
  and status = 'approved';

update public.supplements
set
  description = 'A seed oil rich in gamma-linolenic acid (GLA) that is used for hormonal symptoms, breast pain, and skin support.',
  what_is_it = 'Evening primrose oil is extracted from the seeds of the Oenothera biennis plant. It is rich in gamma-linolenic acid (GLA), an omega-6 fatty acid involved in inflammation and hormonal balance. It is one of the richest plant sources of GLA, which helps the body produce prostaglandins that regulate inflammation and menstrual function.',
  why_use_it = 'It is used to help reduce breast pain, ease premenstrual symptoms, and support hormonal balance. It may also help with menopausal symptoms and support skin health.',
  how_does_it_work = 'GLA is converted into compounds that influence inflammatory pathways and prostaglandin balance. This may help regulate hormonal effects and reduce inflammation in tissues such as the breast and skin.',
  side_effects = 'Evening primrose oil is generally well tolerated. Some people may experience mild digestive discomfort, nausea, or headache. Benefits typically require consistent use over several weeks.',
  risks_and_interactions = 'It may increase bleeding risk when combined with anticoagulants or antiplatelet medications. It may also interact with medications that affect seizure risk. Avoid use during pregnancy unless advised by a clinician.',
  who_might_benefit = 'Women with premenstrual symptoms, breast tenderness, or menopausal symptoms may benefit, as well as individuals seeking mild anti-inflammatory support.',
  evidence = 'Evidence is mixed but suggests possible benefits for some uses: Kazeimi et al. (2021), Journal of Family Medicine and Primary Care, found 1,000 mg twice daily for 8 weeks did not improve hot flashes but did reduce night sweats in postmenopausal women, with no side effects reported, ranked 11th of 13 for female hormone balance; Arsić et al. (2023), Scientific Reports, found fish oil plus evening primrose oil for 12 weeks lowered IL-6 in breast cancer patients on chemotherapy but not other inflammation markers, ranked 29th of 38 for anti-inflammatory support; Senapati et al. (2008), Indian Journal of Dermatology, Venereology and Leprology, found 500 mg for 5 months improved eczema symptoms in 96% versus 32% with placebo, with no reported side effects, ranked 11th of 20 for skin health, with small trials and limited scope.',
  evidence_score = 52,
  how_to_use = 'Typical dose is 1.5-3 g daily taken with meals. Consistent use for at least 2-3 months is recommended for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 1.5-3 g daily, taken with meals.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 3,
    'per_intake_min_value', 1.5,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Evening Primrose Oil'
  and status = 'approved';

update public.supplements
set
  description = 'Fenugreek is a seed-based supplement that may help with blood sugar control and offers modest support for sexual function, testosterone, and strength.',
  what_is_it = 'Fenugreek is a plant seed used in traditional medicine, rich in saponins, fibre, and flavonoids. It is commonly taken as a supplement to support metabolic, hormonal, and general health.',
  why_use_it = 'Fenugreek is used to support blood sugar control, improve insulin sensitivity, and provide metabolic support. It is also used for testosterone, sexual function, and strength, though effects are modest.',
  how_does_it_work = 'Fenugreek contains soluble fibre that slows carbohydrate digestion and absorption, helping regulate blood glucose. It may also influence enzymes involved in hormone metabolism and support circulation through nitric oxide pathways.',
  side_effects = 'Fenugreek is generally well tolerated. Common side effects include digestive discomfort, bloating, and diarrhoea. A maple-like body odour may occur. Starting with a lower dose may improve tolerance.',
  risks_and_interactions = 'Fenugreek may enhance the effects of diabetes medications, increasing the risk of low blood sugar. It may also interact with anticoagulants and reduce iron absorption. Avoid during pregnancy.',
  who_might_benefit = 'Individuals seeking blood sugar support, those with insulin resistance, or people looking for mild hormonal or performance support may benefit.',
  evidence = 'Evidence is strongest for blood sugar control, with Kim et al. (2023) in Nutrients finding in 10 studies with 706 people that fenugreek lowered fasting glucose, post-meal glucose, and HbA1c with only mild stomach discomfort and no liver or kidney harm; it ranked 4th of 27. For male sexual arousal, Rao et al. (2016) in Aging Male reported that 600 mg daily for 12 weeks in 120 healthy men improved arousal, libido, erection quality, intercourse frequency, and testosterone with good tolerability, ranking 1st of 10. For female sexual arousal, Rao et al. (2015) in Phytotherapy Research found that 600 mg daily for 8 weeks in 80 healthy women improved arousal and desire with increased estradiol and free testosterone and no reported side effects, ranking 1st of 7. Testosterone support was backed by Mansoori et al. (2020) in Phytotherapy Research, a meta-analysis of 4 trials showing higher total testosterone versus placebo, ranking 3rd of 9. Strength benefits were supported by Rao et al. (2020) in Translational Sports Medicine, where 600 mg daily for 8 weeks in 138 men improved leg press strength and lean mass, ranking 10th of 20, while endurance and female hormone balance evidence was more modest from smaller trials. Cholesterol and weight-management findings were also positive but less central, with meta-analytic lipid improvements and a small study showing reduced fat intake.',
  evidence_score = 92,
  how_to_use = 'For testosterone or strength: 500-600 mg daily of a standardised extract. For blood sugar support: 5-15 g daily of seeds or powder. Take with meals and use consistently.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardised extract', 'multiple indications present'),
    'confidence', 0.93,
    'source_text', 'For testosterone / strength: 500-600 mg daily of a standardised extract. For blood sugar support: 5-15 g daily of seeds or powder.',
    'parser_method', 'manual',
    'per_intake_max_value', 600,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Fenugreek'
  and status = 'approved';

update public.supplements
set
  description = 'Fisetin is a flavonoid supplement studied for healthy ageing, inflammation, antioxidant support, and possible cognitive benefits.',
  what_is_it = 'Fisetin is a flavonoid polyphenol found in foods such as strawberries and apples, and it is sold as a supplement for healthy ageing and cellular health.',
  why_use_it = 'It is used to support healthy ageing, reduce inflammation, provide antioxidant effects, and possibly support cognition, although human evidence is limited.',
  how_does_it_work = 'Fisetin may influence ageing-related cellular pathways by helping remove senescent cells, reducing inflammatory signaling, and supporting antioxidant defenses that limit cellular stress.',
  side_effects = 'Human data are very limited, but fisetin appears well tolerated in early research. Mild gastrointestinal discomfort may occur. Optimal dosing and long-term safety are not established.',
  risks_and_interactions = 'No confirmed drug interactions are known, though there are theoretical effects on blood clotting. Avoid use during pregnancy or breastfeeding because safety data are lacking. Product quality may vary.',
  who_might_benefit = 'Older adults and people interested in longevity or cellular health may consider fisetin, but evidence in humans remains limited.',
  evidence = 'Evidence is weak and mostly preclinical. Yousefzadeh et al. (2018, EBioMedicine) found fisetin was the strongest senolytic among 10 compounds tested in mice, improving disease markers, tissue function, and lifespan with few side effects, but the evidence was animal-only and ranked 12th of 15 for anti-ageing supplements. Maher et al. (2006, Proceedings of the National Academy of Sciences) reported fisetin activated memory-related pathways in rats and improved object recognition memory in mice, with no human trials, ranking 20th of 20 for memory enhancing supplements. Kim et al. (2023, Cancers) found fisetin reduced inflammatory markers and tumor growth in cell and mouse models without obvious toxicity, but the evidence was limited to cell and animal studies and ranked 36th of 38 for anti-inflammatory supplements.',
  evidence_score = 15,
  how_to_use = 'Typical use is around 100-200 mg daily or intermittently, and it is best taken with meals containing fat. Use cautiously because optimal dosing and long-term safety are not established.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('daily', 'intermittent', 'with_food'),
    'confidence', 0.78,
    'source_text', 'Typical dose: Around 100-200 mg daily or used intermittently. Note: Best taken with meals containing fat.',
    'parser_method', 'direct_text_parse',
    'per_intake_max_value', 200,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Fisetin'
  and status = 'approved';

update public.supplements
set
  description = 'Folate is a B-vitamin that supports DNA synthesis, methylation, brain function, fertility, and homocysteine control.',
  what_is_it = 'Folate is a B-vitamin (B9) essential for DNA synthesis, methylation, and brain function. It is available as folic acid or methylfolate, the active form used by the body.',
  why_use_it = 'Folate is used to support mood, reduce symptoms of depression, and enhance the effects of antidepressants. It also supports cognitive function, fertility, and cardiovascular health through homocysteine regulation.',
  how_does_it_work = 'Folate acts as a methyl donor in the production of neurotransmitters such as serotonin and dopamine. It helps reduce homocysteine levels and supports neuronal function, myelin formation, and brain health.',
  side_effects = 'Folate is generally well tolerated. Mild gastrointestinal symptoms are rare. High doses of folic acid may mask vitamin B12 deficiency, so checking B12 levels is advisable.',
  risks_and_interactions = 'Folate may interact with medications such as methotrexate and anticonvulsants. High doses may affect certain cancer treatments. Seek medical advice if taking regular medication.',
  who_might_benefit = 'Individuals with low mood, elevated homocysteine, or low dietary intake, as well as vegetarians and those with increased nutritional needs, may benefit.',
  evidence = 'Bedson et al. (2014), Health Technology Assessment, found that 5 mg folic acid daily for 12 weeks did not improve depression outcomes in 475 adults on antidepressants and was not clinically or cost-effective as an add-on, ranked 16th of 18 for mood support. Asbaghi et al. (2021), Nutrients, reported small, inconsistent reductions in inflammatory markers, especially CRP, across 1,279 adults in a dose-response meta-analysis, ranked 14th of 38 for anti-inflammatory support. Durga et al. (2007), The Lancet, found 800 micrograms daily for 3 years improved memory, processing speed, and sensorimotor function in 818 adults aged 50-70 with high homocysteine, ranked 10th of 24 for cognitive support. Ma et al. (2016), Scientific Reports, found 400 micrograms daily for 12 months improved thinking and memory in 180 older adults with mild cognitive impairment, though effects in the general public were less clear, ranked 10th of 20 for memory support. Cueto et al. (2022), Human Reproduction, found higher folate intake improved fecundability in 9,559 women trying to conceive, with at least 400 micrograms daily linked to faster conception, ranked 1st of 9 for female fertility. Li et al. (2016), Journal of the American Heart Association, found folic acid reduced stroke risk by 10% and overall heart disease by 4% across 30 trials in 82,000 people, with greatest benefit in those with low folate and larger homocysteine reductions, ranked 4th of 18 for cardiovascular health.',
  evidence_score = 83,
  how_to_use = 'Typical dose: 400-1,000 micrograms daily of folic acid. For targeted use: 7.5-15 mg methylfolate. Best taken alongside vitamin B12 and B6.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'micrograms',
    'flags', jsonb_build_array('folic acid', 'daily', 'per_intake_estimated_from_daily_dose'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 400-1,000 micrograms daily of folic acid. For targeted use: 7.5-15 mg methylfolate.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 1000,
    'per_intake_min_value', 400,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Folate (Vitamin B9)'
  and status = 'approved';

update public.supplements
set
  description = 'A Garcinia cambogia rind extract containing hydroxycitric acid that is marketed for weight management but has only modest evidence of benefit.',
  what_is_it = 'Garcinia extract is derived from the rind of Garcinia cambogia fruit and contains hydroxycitric acid (HCA), the main active compound. It is commonly marketed as a supplement for weight management.',
  why_use_it = 'Garcinia is used to support weight loss, reduce appetite, and limit fat accumulation. It is often included in weight management plans, though effects are generally modest.',
  how_does_it_work = 'HCA may inhibit enzymes involved in fat production and increase serotonin levels, which could reduce appetite and food intake. However, these effects are inconsistent in practice.',
  side_effects = 'Garcinia is generally tolerated but may cause gastrointestinal symptoms such as nausea, diarrhea, or abdominal discomfort. Headaches and dizziness can occur.',
  risks_and_interactions = 'Garcinia may interact with diabetes medications and affect blood sugar levels. High doses have been linked to liver concerns in rare cases. Avoid use during pregnancy or breastfeeding.',
  who_might_benefit = 'Individuals seeking modest appetite control or additional support during weight loss efforts may consider it, though it should not replace diet and lifestyle changes.',
  evidence = 'Onakpoya et al. (2011), Obesity, systematic review and meta-analysis of 12 randomized clinical trials found Garcinia cambogia produced only 0.88 kg more weight loss than placebo over 12 weeks, with stomach side effects about twice as common; the authors questioned the small, uncertain benefit and called for better studies. Ranked 17th out of 22 for weight management supplements, with limitations including modest effects and uncertain clinical importance.',
  evidence_score = 21,
  how_to_use = 'Typical dose: 1,500-3,000 mg HCA daily, in divided doses 30-60 minutes before meals. Standardised extracts are preferred, though quality varies.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg HCA',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 1,500-3,000 mg HCA daily, in divided doses 30-60 minutes before meals.',
    'parser_method', 'manual',
    'per_intake_max_value', 1000,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 3
  ),
  dose_scoring_profile_json = null
where name = 'Garcinia Cambogia'
  and status = 'approved';

update public.supplements
set
  description = 'Aged garlic extract is a stabilized garlic supplement used mainly for immune and cardiovascular support.',
  what_is_it = 'Garlic extract, particularly aged garlic extract (AGE), is derived from garlic cloves that have been aged to stabilise and concentrate bioactive compounds such as S-allylcysteine (SAC). It is commonly used for immune and cardiovascular support.',
  why_use_it = 'Garlic is used to support immune function, reduce the risk of colds and flu, lower blood pressure in people with hypertension, improve cardiovascular health, reduce arterial stiffness, and provide antioxidant and anti-inflammatory effects.',
  how_does_it_work = 'Garlic compounds such as allicin and SAC enhance immune activity including natural killer cell function and promote vasodilation through hydrogen sulphide production, helping to lower blood pressure. Its antioxidant properties reduce oxidative stress and inflammation.',
  side_effects = 'Generally well tolerated. Mild side effects include gastrointestinal discomfort, nausea, flatulence, and garlic odour. Odourless formulations may improve tolerability. Effects typically require consistent use over 2-12 weeks.',
  risks_and_interactions = 'Garlic may enhance the effects of anticoagulants such as warfarin, increasing bleeding risk, and may add to blood pressure-lowering medications. High doses are not recommended during pregnancy. Seek medical advice if on medication.',
  who_might_benefit = 'Individuals prone to frequent infections, those with high blood pressure, people seeking cardiovascular support, and those wanting a natural anti-inflammatory supplement.',
  evidence = 'Evidence is strong across immune, blood pressure, inflammation, and some lipid outcomes. Nantz et al. (2012) in Molecular Nutrition & Food Research found that 2.56 g/day aged garlic extract for 12 weeks in 120 healthy adults reduced cold and flu severity and sick days and improved immune markers with no reported side effects; it ranked 8th of 19 for immune health. Ma et al. (2025) in Asian Biomedicine found in 12 randomized placebo-controlled trials with 738 hypertensive patients that garlic extracts lowered systolic blood pressure by about 8 mmHg and diastolic blood pressure by about 4 mmHg versus placebo, ranking 1st of 20 for blood pressure control. Mofrad et al. (2019) in The Journal of Nutrition found across 16 trials with 831 people that garlic supplements lowered CRP and TNF-alpha, with stronger effects at higher baseline CRP and longer duration, ranking 6th of 38 for anti-inflammatory supplements. Kheirmandparizi et al. (2021) in Complementary Therapies in Medicine found mixed lipid effects, with total cholesterol and triglyceride improvements in some populations but only total cholesterol reduction in coronary artery disease patients, ranking 15th of 26 for cholesterol support.',
  evidence_score = 87,
  how_to_use = 'Take with meals and use consistently for at least 2-12 weeks. Choose standardised extracts. Immune support: 600-1,200 mg/day aged garlic extract. Blood pressure: 1,200-2,400 mg/day aged garlic extract.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardised_extract', 'per_day'),
    'confidence', 0.93,
    'source_text', 'Immune support: 600-1,200 mg/day aged garlic extract. Blood pressure: 1,200-2,400 mg/day aged garlic extract.',
    'parser_method', 'direct_text_parse',
    'per_intake_max_value', 2400,
    'per_intake_min_value', 600,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Garlic Extract (Aged Garlic Extract)'
  and status = 'approved';

update public.supplements
set
  description = 'Ginger is a root supplement used mainly for nausea, digestion, inflammation, and joint pain.',
  what_is_it = 'Ginger (Zingiber officinale) is a rhizome containing active compounds such as gingerols and shogaols. It is sold as fresh root, powder, extracts, and supplements, and is commonly used for digestive and anti-inflammatory support.',
  why_use_it = 'Ginger is used to reduce joint pain in osteoarthritis, decrease post-exercise muscle soreness, support digestion including nausea relief, provide antioxidant protection, and offer natural anti-inflammatory effects.',
  how_does_it_work = 'Gingerols and related compounds inhibit COX and LOX enzymes, reducing inflammatory mediators. Ginger also suppresses pro-inflammatory cytokines such as TNF-alpha and NF-kappaB signalling, while providing antioxidant activity and supporting nitric oxide production.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal discomfort, heartburn, or irritation can occur, especially at higher doses. Taking it with food may improve tolerability.',
  risks_and_interactions = 'Ginger may enhance the effects of anticoagulants, increasing bleeding risk, and may add to blood pressure or glucose-lowering medications. High doses should be avoided during pregnancy unless medically advised. Effects may require 2-8 weeks of consistent use.',
  who_might_benefit = 'People with osteoarthritis or joint pain, athletes seeking improved recovery, those with chronic low-grade inflammation, and people looking for a natural alternative to NSAIDs may benefit.',
  evidence = 'Morvaridzadeh et al. (2020) in Cytokine reviewed 16 randomized trials with 1,010 people and found ginger lowered CRP, hs-CRP, and TNF-alpha but not IL-6 or soluble intercellular adhesion molecules; it ranked 3rd of 38 for anti-inflammatory supplements, with some outcome inconsistency. Bartels et al. (2014) in Osteoarthritis and Cartilage analyzed 5 placebo-controlled trials in 593 people with osteoarthritis and found ginger reduced pain and improved physical function, though side effects caused more dropouts; it ranked 8th of 14 for joint health supplements. Matsumura et al. (2015) in Phytotherapy Research studied 20 untrained people and found 4 g daily for 5 days improved strength recovery at 48 hours after hard exercise but did not reduce soreness or muscle damage, and the effect faded by 72-96 hours; it ranked 9th of 9 for exercise recovery supplements. Nikkhah Bodagh et al. (2019) in Food Science & Nutrition reviewed clinical trials and found about 1,500 mg per day in split doses helps relieve nausea, while evidence for bloating and indigestion remains limited; it ranked 7th of 13 for digestive health supplements.',
  evidence_score = 74,
  how_to_use = 'Typical dose is 500-2,000 mg daily, with around 1,000 mg commonly used. For post-exercise recovery, around 2 g daily for 5-11 days has been studied. Take with meals, and consistent use for 4-8 weeks is usually needed for anti-inflammatory benefits.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 500-2,000 mg daily (around 1,000 mg commonly used). Post-exercise recovery: Around 2 g daily for 5-11 days. Note: Take with meals. Consistent use for 4-8 weeks usually needed for anti-inflammatory benefits.',
    'parser_method', 'manual',
    'per_intake_max_value', 2000,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Ginger'
  and status = 'approved';

update public.supplements
set
  description = 'A leaf extract from the Ginkgo tree used for cognitive support, circulation, and mood.',
  what_is_it = 'Ginkgo biloba extract is derived from the leaves of the Ginkgo tree and contains active compounds including flavonoids and terpenoids. It is commonly used as a supplement for cognitive support, circulation, and mood. Ginkgo biloba is one of the oldest known medicinal trees - its extracts have been used for centuries, and modern trials confirm genuine benefits for cognition, mood, and anxiety, particularly in older adults.',
  why_use_it = 'Ginkgo is used to support memory and cognition, improve mood, enhance circulation, provide neuroprotection, and support attention. Evidence is more consistent in mild cognitive impairment than in healthy individuals.',
  how_does_it_work = 'Ginkgo may improve cerebral blood flow through vasodilation, enhancing oxygen and nutrient delivery to brain tissue. Flavonoids provide antioxidant protection, while terpenoids support mitochondrial function and may increase BDNF, aiding neuroplasticity. It may also modulate neurotransmitters and reduce platelet aggregation.',
  side_effects = 'Generally well tolerated. Possible side effects include headache, dizziness, gastrointestinal discomfort, and mild restlessness. Standardised extracts are preferred for consistency. Benefits typically require 4-12 weeks of use.',
  risks_and_interactions = 'Ginkgo may increase bleeding risk, particularly when combined with anticoagulants or antiplatelet medications - monitoring is essential. It may also interact with SSRIs and other medications. Avoid during pregnancy.',
  who_might_benefit = 'Individuals with mild cognitive impairment or age-related cognitive decline, those seeking adjunctive support for mood, and individuals with circulation-related concerns.',
  evidence = 'Tan et al. (2023), International Journal of Geriatric Psychiatry, reviewed multiple trials in 946 people with mild cognitive impairment and found Ginkgo biloba extract EGb 761 improved memory, processing speed, attention, executive function, depression, and anxiety with side effects similar to placebo; ranked 4th of 24 for cognitive support, with the main limitation that benefits were clearer in mild cognitive impairment than in healthy people. Beck et al. (2016), Human Psychopharmacology, studied 61 cognitively intact older adults with subjective memory impairment and found 240 mg daily for 6 weeks improved cognitive flexibility and possibly response inhibition but not other memory measures; ranked 7th of 20 for memory enhancing, with a small sample and limited duration. Lin et al. (2024), Frontiers in Pharmacology, found ginkgo biloba reduced depression scores at 4-8 weeks, improved mood-related markers like serotonin, and had about a 22% better response than control without extra side effects; ranked 7th of 18 for mood support. Woelk et al. (2007), Journal of Psychiatric Research, randomized 107 patients with generalized anxiety or adjustment disorder with anxious mood and found 240-480 mg daily for 4 weeks significantly reduced anxiety more than placebo, especially at higher doses, and was safe and well tolerated; ranked 4th of 15 for stress relief.',
  evidence_score = 80,
  how_to_use = 'Cognitive support or mood: 120-240 mg daily of standardized extract. Circulation: around 120 mg daily. Take with meals and use consistently for 4-12 weeks before assessing benefit.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardized_extract'),
    'confidence', 0.93,
    'source_text', 'Cognitive support / mood: 120-240 mg daily of standardised extract. Circulation: Around 120 mg daily.',
    'parser_method', 'rule-based',
    'per_intake_max_value', 240,
    'per_intake_min_value', 120,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Ginkgo Biloba'
  and status = 'approved';

update public.supplements
set
  description = 'A soluble fibre from konjac root that expands in the stomach to promote fullness and support weight, cholesterol, blood sugar, and digestive health.',
  what_is_it = 'Glucomannan is a soluble fibre from konjac root that absorbs water and expands in the stomach, forming a viscous gel that slows digestion.',
  why_use_it = 'Used for weight loss by increasing satiety and reducing appetite. May also support cholesterol levels, blood glucose control, and digestive health.',
  how_does_it_work = 'Glucomannan expands in the stomach, increasing fullness and reducing food intake. It slows gastric emptying and carbohydrate absorption, lowering post-meal glucose spikes. It is fermented in the gut to short-chain fatty acids, supporting metabolic health.',
  side_effects = 'Common side effects include bloating, gas, constipation, or diarrhoea, especially initially.',
  risks_and_interactions = 'Must be taken with at least 250 mL water per dose to prevent choking or obstruction. Risk of oesophageal or intestinal blockage if taken without enough water. Can reduce absorption of medications - separate by at least 1 hour. Use caution in dysphagia or GI conditions. May enhance glucose-lowering effects.',
  who_might_benefit = 'Overweight individuals seeking appetite control, those wanting cholesterol or blood sugar support, and people able to tolerate fibre-related side effects.',
  evidence = 'Weight management: Zalewski et al. (2015), Nutrition Reviews, systematic review of 6 randomised trials found small short-term weight losses in 3 trials among overweight/obese adults, but no BMI benefit and mixed results; ranked 13th of 22, with limited duration and inconsistent findings. Blood sugar control: Mirzababaei et al. (2022), Nutrition & Metabolism, systematic review and meta-analysis of 6 trials in 124 people found fasting blood sugar was significantly lowered but post-meal glucose was not meaningfully changed; ranked 5th of 27. Cholesterol support: Musazadeh et al. (2024), European Journal of Clinical Nutrition, GRADE-assessed systematic review and meta-analysis of 9 trials found lower total and LDL cholesterol but not HDL or triglycerides, with stronger effects at doses above 5,000 mg daily and under 8 weeks; ranked 3rd of 26. Digestive health: Zhu et al. (2025), European Journal of Nutrition, 8-week trial in 48 elite male athletes with constipation found 3 g/day improved constipation symptoms, bowel movement frequency, and quality of life versus placebo, with microbiota changes; ranked 4th of 13.',
  evidence_score = 60,
  how_to_use = 'Typical dose: 2.7-15 g daily in divided doses. Take 15-30 minutes before meals with at least 250 mL water per dose. Start low and increase gradually. Hydration is essential.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('divided doses', 'take before meals', 'requires water'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 2.7-15 g daily in divided doses. Timing: Take 15-30 minutes before meals with at least 250 mL water per dose.',
    'parser_method', 'rule-based',
    'per_intake_max_value', 15,
    'per_intake_min_value', 2.7,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Glucomannan'
  and status = 'approved';

update public.supplements
set
  description = 'A glucosamine supplement used mainly to support joint health and ease osteoarthritis symptoms.',
  what_is_it = 'Glucosamine is an amino sugar derived from shellfish or made synthetically, available as sulphate, hydrochloride, or N-acetyl forms, and commonly used for osteoarthritis and joint support.',
  why_use_it = 'It is used to reduce joint pain and stiffness, support cartilage integrity, improve mobility, and reduce reliance on NSAIDs, with possible minor benefits for skin and connective tissue health.',
  how_does_it_work = 'Glucosamine is a precursor for glycosaminoglycans and proteoglycans, which are key cartilage components. It may help stimulate cartilage production, reduce breakdown, modulate inflammation, and improve synovial fluid function.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal symptoms such as nausea, heartburn, and diarrhoea can occur. Effects usually take 8-12 weeks and vary between individuals.',
  risks_and_interactions = 'Avoid shellfish-derived products if allergic. May interact with anticoagulants such as warfarin, increasing bleeding risk. It may affect blood glucose, so monitoring is advised in diabetes. Not recommended in pregnancy without supervision.',
  who_might_benefit = 'People with mild-to-moderate osteoarthritis of the knee or hip, those seeking non-drug pain relief, and people aiming to reduce NSAID use.',
  evidence = 'Veronese et al. (2020), Therapeutic Advances in Musculoskeletal Disease, reported in an umbrella review of 37 trials in about 4,000 people with knee osteoarthritis that prescription glucosamine sulphate 1,500 mg/day reduced disease progression by 62% versus placebo with no increase in side effects; it was ranked 2nd out of 14 for joint health supplements, though the broader evidence base includes mixed outcomes across uses. Murad et al. (2001), Journal of Dermatological Treatment, found in a 5-week preliminary study of 53 women that a supplement containing glucosamine and other nutrients reduced visible wrinkles and fine lines by 34% but did not change skin hydration, and Gueniche et al. (2017), Skin Pharmacology and Physiology, reported in an 8-week trial of eight women over 50 that 250 mg/day oral glucosamine sulphate increased markers related to collagen, hyaluronic acid, and elasticity; these smaller studies were ranked lower and have limited sample sizes.',
  evidence_score = 83,
  how_to_use = 'Typical dose is 1,500 mg daily, taken once daily or as 500 mg three times daily, preferably with meals. Use consistently for 8-12 weeks before judging benefit, and it can be combined with chondroitin.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.98,
    'source_text', 'Typical dose: 1,500 mg daily (once daily or 500 mg three times daily).',
    'parser_method', 'manual',
    'per_intake_max_value', 1500,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Glucosamine sulphate'
  and status = 'approved';

update public.supplements
set
  description = 'Glycine is a simple amino acid used mainly to support sleep quality and next-day alertness.',
  what_is_it = 'Glycine is the simplest amino acid, found in protein-rich foods and produced by the body. It acts as a neurotransmitter and a building block for collagen.',
  why_use_it = 'Primarily used to improve sleep quality, reduce time to fall asleep, decrease daytime fatigue, and promote a calm state without heavy sedation.',
  how_does_it_work = 'Glycine acts as an inhibitory neurotransmitter, promoting relaxation. It modulates NMDA receptors in the brain and increases peripheral vasodilation, lowering core body temperature - a key signal for sleep onset.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal effects such as nausea and soft stools may occur. It does not typically cause morning grogginess and may improve next-day cognitive function.',
  risks_and_interactions = 'May interact with clozapine. Conflicting data exists regarding stroke risk in certain populations. Generally safe for healthy adults, but consult a clinician if on antipsychotic medication.',
  who_might_benefit = 'Individuals with poor sleep quality or difficulty falling asleep, those with wired but tired patterns, older adults, and people seeking a non-hormonal sleep aid.',
  evidence = 'Yamadera et al. (2007), Sleep and Biological Rhythms, in an 11-person crossover study of poor sleepers, found 3 g glycine before bed improved subjective sleep quality and efficiency, shortened time to sleep onset and deep sleep, and reduced next-day sleepiness with better memory performance; ranked 6th of 11 for sleep support, with the main limitation being the very small sample. Bannai et al. (2012), Frontiers in Neurology, in 11 healthy sleep-restricted subjects, found 3 g glycine before bed reduced next-day fatigue and improved objective alertness and attention on days 1 and 3, with only early subjective fatigue improvement; ranked 16th of 21 for energy enhancing, with a very small sample and limited duration.',
  evidence_score = 54,
  how_to_use = 'Typical dose is 3 g taken 30-60 minutes before bed. It can be dissolved in water due to its naturally sweet taste, and consistent nightly use may support sleep rhythm.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.98,
    'source_text', 'Typical dose: 3 g (3,000 mg) taken 30-60 minutes before bed.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 3,
    'per_intake_min_value', 3,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Glycine'
  and status = 'approved';

update public.supplements
set
  description = 'A caffeine-free herb used for vascular, lymphatic, skin, and wound-healing support.',
  what_is_it = 'Gotu Kola (Centella asiatica) is a traditional medicinal herb rich in triterpenoid saponins such as asiaticoside and madecassoside that are associated with vascular and connective tissue support.',
  why_use_it = 'It is used to support venous and lymphatic function, reduce leg heaviness and swelling, improve skin elasticity, and support wound healing.',
  how_does_it_work = 'It appears to stimulate collagen synthesis, strengthen connective tissue around blood vessels, improve endothelial integrity, reduce capillary leakage, and enhance microcirculation, which may help reduce fluid accumulation and support lymphatic flow.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal upset, headache, dizziness, or topical dermatitis may occur. It may also have mild calming effects rather than stimulant properties.',
  risks_and_interactions = 'Rare hepatotoxicity has been reported, and it is metabolized in the liver, so caution is advised with hepatotoxic medications such as statins and paracetamol, as well as alcohol. It may enhance sedative effects. Avoid use in pregnancy.',
  who_might_benefit = 'People with venous insufficiency, leg swelling or heaviness, frequent travelers, and those seeking support for wound healing or skin health.',
  evidence = 'Chong et al. (2013), Cochrane Database of Systematic Reviews, reviewed eight trials and found Centella asiatica improved leg circulation, oxygen levels, vein flexibility, and symptoms such as swelling, pain, and heaviness in chronic venous insufficiency, but poor reporting and possible bias limit confidence. Farahani et al. (2023), Journal of Clinic Care Skill, found that 200 mg oral Centella asiatica twice daily in 76 hospitalized burn patients reduced burn pain and improved several wound features, though the overall wound healing score was not significantly changed. Kongkaew et al. (2020), Phytotherapy Research, reported that clinical trials in 172 Asian females showed improvements in wrinkles and skin texture and better hydration versus tretinoin, with fewer side effects; overall evidence was rated highly for lymphatic support, injury recovery, and skin health.',
  evidence_score = 82,
  how_to_use = 'Standardized extract: 60-180 mg daily. Non-standardized: 300-500 mg daily. Use consistently for 4-8 weeks for benefits.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardized_extract', 'non_standardized_extract_present'),
    'confidence', 0.86,
    'source_text', 'Standardised extract: 60-180 mg daily. Non-standardised: 300-500 mg daily.',
    'parser_method', 'manual_extraction',
    'per_intake_max_value', 500,
    'per_intake_min_value', 60,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Gotu Kola'
  and status = 'approved';

update public.supplements
set
  description = 'A concentrated Camellia sinensis supplement that provides catechins, especially EGCG, for metabolic and antioxidant support.',
  what_is_it = 'Green tea extract is a concentrated supplement derived from Camellia sinensis, rich in catechins - particularly epigallocatechin gallate (EGCG), typically standardised to around 45-50%. It provides a more potent dose than drinking green tea alone.',
  why_use_it = 'Used to support weight management via increased fat oxidation and thermogenesis, provide antioxidant protection for cardiovascular health, support blood glucose regulation, and offer mild cognitive benefits. It is often included in metabolic and fat loss stacks.',
  how_does_it_work = 'EGCG inhibits catechol-O-methyltransferase (COMT), prolonging norepinephrine activity and sustaining thermogenesis and energy expenditure. It increases fat oxidation, particularly during exercise, and may modestly improve insulin sensitivity. Effects are often enhanced when combined with caffeine.',
  side_effects = 'Common side effects include nausea, stomach upset, and heartburn, especially when taken on an empty stomach. Caffeine-containing products may cause jitteriness, anxiety, or insomnia in sensitive individuals. Tannins can irritate the gut in some users.',
  risks_and_interactions = 'Rare cases of hepatotoxicity have been reported, particularly with high doses or fasted use - always take with food. May reduce non-heme iron absorption. Can interact with blood thinners and stimulant compounds.',
  who_might_benefit = 'Individuals aiming for modest metabolic support during weight loss, those seeking antioxidant benefits, and people wanting mild cognitive enhancement.',
  evidence = 'Asbaghi et al. (2024), British Journal of Nutrition, a GRADE-assessed systematic review and dose-response meta-analysis of 59 randomised trials (3,802 participants) found green tea extract significantly reduced body weight, BMI, and body fat percentage, with stronger effects in obese participants and studies up to 12 weeks, but the optimal dose range was inconsistent; Haghighatdoost et al. (2019), Phytotherapy Research, reviewed 16 randomised trials and found green tea significantly decreased TNF-alpha but not CRP or IL-6; Xu et al. (2020), Journal of the American Heart Association, pooled 24 trials (1,697 participants) and found small reductions in systolic and diastolic blood pressure; Xu et al. (2020), Nutrients, pooled 27 trials (2,194 participants) and found a small fasting glucose reduction without significant effects on insulin, HbA1c, or insulin resistance; Zhou et al. (2025), Neuroepidemiology, found in 18 observational studies (58,929 participants) that green tea consumption was associated with lower cognitive impairment risk; Zhang et al. (2022), Nutrients, reported better memory performance in 264 adults aged 50-70 and lower cognitive impairment risk among very high consumers; Mancini et al. (2017), Psychopharmacology, reviewed 21 human studies (1,513 participants) and found small but consistent improvements in attention, working memory, and alertness; Xu et al. (2020), Lipids in Health and Disease, reviewed 31 trials (3,321 people) and found modest reductions in total and LDL cholesterol, with overall evidence strongest for weight management and more limited for glycaemic outcomes.',
  evidence_score = 91,
  how_to_use = 'Typical dose: 400-500 mg EGCG daily, taken with meals. Maximum: Do not exceed 800 mg EGCG daily. Consistent use is key.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg EGCG',
    'flags', jsonb_build_array('with meals', 'daily'),
    'confidence', 0.95,
    'source_text', 'Typical dose: 400-500 mg EGCG daily, taken with meals. Maximum: Do not exceed 800 mg EGCG daily.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 500,
    'per_intake_min_value', 400,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Green Tea Extract'
  and status = 'approved';

update public.supplements
set
  description = 'A gymnemic-acid-containing leaf extract used to help reduce sugar cravings and support blood sugar control.',
  what_is_it = 'Gymnema sylvestre is a plant whose leaves contain gymnemic acids and is sold as tea, powder, or standardized capsules for blood sugar regulation and craving control.',
  why_use_it = 'It is used to improve glycaemic control in prediabetes and type 2 diabetes, reduce sugar cravings, support weight management, and modestly improve blood pressure and metabolic markers.',
  how_does_it_work = 'Gymnemic acids temporarily block sweet taste receptors on the tongue, reducing sweetness perception and helping curb cravings. In the gut, they may reduce glucose absorption and post-meal blood sugar spikes, and some data suggest support for insulin secretion and pancreatic function.',
  side_effects = 'Generally well tolerated. Temporary blunting of sweet taste is common. Mild gastrointestinal discomfort may occur, especially if taken without food.',
  risks_and_interactions = 'Can significantly enhance the glucose-lowering effects of diabetes medications, increasing hypoglycaemia risk, so close monitoring is needed. Rare liver toxicity has been reported. Discontinue at least 2 weeks before surgery.',
  who_might_benefit = 'Individuals with prediabetes or type 2 diabetes as adjunct support, people with strong sugar cravings, and those reducing refined sugar intake.',
  evidence = 'Devangan et al. (2021) Phytotherapy Research found in a systematic review and meta-analysis of 419 people across 10 trials that Gymnema sylvestre lowered fasting and post-meal blood sugar, reduced HbA1c, and decreased triglycerides and total cholesterol; it was ranked 15th of 27 for blood sugar control, with the main limitation being the small number and size of trials. Zamani et al. (2023) Phytotherapy Research found in six trials with about 113 participants that Gymnema sylvestre lowered total cholesterol, LDL cholesterol, triglycerides, and slightly reduced diastolic blood pressure and fasting blood sugar with no major side effects; it was ranked 14th of 26 for cholesterol support and 14th of 20 for blood pressure control, with limited trial numbers and sample size. Basciani et al. (2023) Nutrients reported that in 37 overweight and obese adults on a calorie-reduced Mediterranean diet, a daily supplement containing Gymnema sylvestre, inositols, and alpha-lactalbumin for 6 months produced greater reductions in weight, waist, triglycerides, and insulin resistance than diet alone; it was ranked 18th of 22 for weight management, but Gymnema was part of a combination product so its independent effect is unclear.',
  evidence_score = 59,
  how_to_use = 'For cravings, take a capsule or liquid before meals or place it on the tongue. For blood sugar, use 400-600 mg daily of an extract standardized to at least 25% gymnemic acids in divided doses with meals. Consistent use is required.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardized_extract', 'divided_doses', 'with_meals'),
    'confidence', 0.86,
    'source_text', 'For blood sugar: 400-600 mg daily (at least 25% gymnemic acids) in divided doses with meals.',
    'parser_method', 'rule_based',
    'per_intake_max_value', 300,
    'per_intake_min_value', 200,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 2
  ),
  dose_scoring_profile_json = null
where name = 'Gymnema Sylvestre Extract'
  and status = 'approved';

update public.supplements
set
  description = 'A tart herbal extract from Hibiscus sabdariffa used mainly to support healthy blood pressure and cardiovascular health.',
  what_is_it = 'Hibiscus extract is derived from the calyces of Hibiscus sabdariffa, a plant rich in anthocyanins, polyphenols, and organic acids. It is commonly consumed as a tart herbal tea or taken in capsule form for cardiovascular support, particularly blood pressure management.',
  why_use_it = 'Primarily used to help manage mild-to-moderate hypertension. It may reduce both systolic and diastolic blood pressure and support overall cardiovascular health. Additional benefits include modest improvements in cholesterol profiles and antioxidant protection.',
  how_does_it_work = 'Hibiscus appears to act as a natural ACE inhibitor, helping relax blood vessels and lower vascular resistance. It also has mild diuretic effects, increasing sodium excretion, and may promote vasodilation through nitric oxide production and calcium channel modulation.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal upset, bloating, or acidity can occur at higher doses. The tea has a naturally tart taste, which some may find strong.',
  risks_and_interactions = 'May have additive effects with antihypertensive medications or diuretics, increasing risk of low blood pressure - monitor accordingly. Potential interaction with paracetamol. Avoid during pregnancy due to possible uterine effects.',
  who_might_benefit = 'Individuals with pre-hypertension or mild hypertension seeking a plant-based approach, and those wanting antioxidant cardiovascular support.',
  evidence = 'Serban et al. (2021), Journal of Hypertension, reviewed 13 trials in 1,205 adults and found hibiscus tea or extract lowered systolic blood pressure by about 7 mmHg and diastolic by about 4 mmHg, worked best in people with hypertension, and was generally as effective as some blood pressure medicines, though the evidence was ranked 2nd out of 20 and limited by trial variability. Ellis et al. (2022), Nutrition Reviews, reviewed 17 studies and found hibiscus capsules at about 1,000 mg three times daily lowered total and LDL cholesterol by roughly 8-14% with little change in HDL or triglycerides, with best effects in those with higher baseline cholesterol, though the evidence was ranked 8th out of 26 and was less consistent across studies.',
  evidence_score = 80,
  how_to_use = 'As tea: 1-2 teaspoons dried calyces, 2-3 cups daily. As extract: 1-2 g daily in divided doses. Consistent use is required for benefits.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('tea_and_extract_present', 'divided_doses', 'per_intake_estimated_from_daily_range'),
    'confidence', 0.78,
    'source_text', 'As extract: 1-2 g daily in divided doses.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 1,
    'per_intake_min_value', 0.5,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Hibiscus Extract'
  and status = 'approved';

update public.supplements
set
  description = 'A leucine metabolite supplement used to help preserve muscle and support recovery.',
  what_is_it = 'HMB (beta-hydroxy beta-methylbutyrate) is an active metabolite of the amino acid leucine, produced in small amounts in the body. It is typically supplemented as calcium HMB to support muscle protein balance and recovery.',
  why_use_it = 'HMB is used to reduce muscle breakdown, preserve lean muscle mass during ageing, illness, or immobilisation, and support recovery and strength gains following intense training. It is particularly useful during periods of stress, calorie restriction, or inactivity.',
  how_does_it_work = 'HMB acts as an anti-catabolic agent. It stimulates muscle protein synthesis via the mTOR pathway while inhibiting the ubiquitin-proteasome system responsible for muscle breakdown. This dual action helps maintain muscle integrity during periods of physiological stress.',
  side_effects = 'HMB is extremely well tolerated. Mild gastrointestinal discomfort is rare. It is non-stimulatory and does not affect sleep, hormones, or cardiovascular function. Effects are gradual and require consistent use.',
  risks_and_interactions = 'No significant drug interactions or serious health risks have been identified in healthy individuals. It appears safe for long-term use at recommended doses.',
  who_might_benefit = 'Older adults at risk of sarcopenia, individuals recovering from injury or prolonged bed rest, beginners starting resistance training, and athletes undergoing high training stress or calorie deficits.',
  evidence = 'Bedeshki et al. (2025), Frontiers in Nutrition, an umbrella review of meta-analyses, found HMB increased lean and fat-free mass and muscle strength, especially in untrained adults over 70, with best results at 3 g daily for at least 12 weeks, but effects were minimal in trained athletes; ranked 7th of 20 for strength enhancing supplements. Rahimi et al. (2018), Journal of the International Society of Sports Nutrition, a meta-analysis of randomized controlled trials, found HMB lowered muscle damage markers, reduced inflammation, and improved perceived recovery, especially after more than six weeks; ranked 4th of 9 for exercise recovery supplements. Hsieh et al. (2006), Asia Pacific Journal of Clinical Nutrition, reported that 3 g daily for 7 days in ICU patients with COPD lowered inflammation and muscle breakdown markers and improved protein handling with no noticeable side effects; ranked 27th of 38 for anti-inflammatory supplements.',
  evidence_score = 73,
  how_to_use = 'Typical dose: 3 g daily, usually split into three 1 g doses. Consistency is more important than timing; doses are often taken with meals.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.98,
    'source_text', 'Typical dose: 3 g daily, usually split into three 1 g doses.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 1,
    'per_intake_min_value', 1,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 3
  ),
  dose_scoring_profile_json = null
where name = 'HMB (Beta-Hydroxy Beta-Methylbutyrate)'
  and status = 'approved';

update public.supplements
set
  description = 'A processed seed extract from horse chestnut that is used to help reduce leg swelling and symptoms of chronic venous insufficiency.',
  what_is_it = 'Horse chestnut extract is derived from the seeds of Aesculus hippocastanum and standardized for escin, a group of triterpene saponins. It must be processed to remove esculin, a toxic compound. It is considered one of the best-studied herbal treatments for venous insufficiency.',
  why_use_it = 'Used to treat chronic venous insufficiency, reduce leg swelling, relieve heaviness and pain in the legs, and support management of varicose veins. It is sometimes used as an alternative or adjunct to compression therapy.',
  how_does_it_work = 'Escin strengthens blood vessel walls by inhibiting hyaluronidase, preserving capillary integrity. It reduces capillary permeability, limiting fluid leakage into tissues and decreasing swelling. It also improves venous tone and circulation.',
  side_effects = 'Generally well tolerated. Mild side effects include headache, dizziness, nausea, or gastrointestinal discomfort. Modified or time-release forms may improve tolerability.',
  risks_and_interactions = 'Raw horse chestnut seeds are toxic and must never be consumed - only processed extracts are safe. Extracts may have mild blood-thinning effects - use caution with anticoagulants. Avoid in significant kidney or liver disease.',
  who_might_benefit = 'Individuals with varicose veins, leg swelling from prolonged standing or sitting, frequent travelers, and those with diagnosed chronic venous insufficiency seeking symptom relief.',
  evidence = 'Pittler et al. (2012), Cochrane Review / Phytomedicine, found that in 1,583 people with chronic venous insufficiency, horse chestnut seed extract providing 100-150 mg escin daily reduced leg swelling, ankle and calf size, and symptoms like pain and heaviness more than placebo; one study found it worked as well as compression stockings. It was ranked 1st out of 7 for lymphatic and swelling support, but the evidence is limited by study quality and the review notes that consistent use is needed for benefit.',
  evidence_score = 72,
  how_to_use = 'Oral: 300 mg extract twice daily, standardized to 50 mg escin per dose. Topical: 2% escin cream applied 3-4 times daily. Consistent use is needed for benefit.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg extract',
    'flags', jsonb_build_array('standardized_extract'),
    'confidence', 0.95,
    'source_text', 'Oral: 300 mg extract twice daily, standardised to 50 mg escin per dose.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 300,
    'per_intake_min_value', 300,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 2
  ),
  dose_scoring_profile_json = null
where name = 'Horse Chestnut Seed Extract'
  and status = 'approved';

update public.supplements
set
  description = 'An oral supplement used to support skin hydration and joint comfort.',
  what_is_it = 'Hyaluronic acid (HA) is a naturally occurring molecule found in skin, joints, and connective tissue that binds water and helps maintain hydration; supplements are usually made by microbial fermentation or from avian sources.',
  why_use_it = 'It is used to improve skin hydration, elasticity, and the appearance of wrinkles and dryness, and to support joint health by reducing pain and stiffness in osteoarthritis, especially in the knees and hips.',
  how_does_it_work = 'After ingestion, HA is absorbed and distributed via the lymphatic system to skin and joint tissues, where it helps retain water, supports hydration, may stimulate fibroblasts and synoviocytes to produce endogenous hyaluronic acid, and may reduce inflammation to improve lubrication and mobility.',
  side_effects = 'Extremely well tolerated. Rare mild gastrointestinal discomfort may occur. Effects are gradual and usually require consistent use over several weeks. Vegan formulations are widely available.',
  risks_and_interactions = 'No significant drug interactions have been identified. Theoretical concerns about cancer growth have not been supported by clinical data. Considered safe for long-term use in healthy individuals.',
  who_might_benefit = 'People with dry or ageing skin, those seeking cosmetic skin support, and people with mild-to-moderate osteoarthritis looking for non-pharmacological relief.',
  evidence = 'Evidence is moderate. For joint health, Sugiyama et al. (2023), Experimental and Therapeutic Medicine, reported that 31 adults with mild knee discomfort taking oral sodium hyaluronate daily for 12 weeks had less knee pain and better movement than placebo, especially those with milder baseline pain, with no important safety concerns; it was ranked 10th out of 15 for joint health supplements. For skin health, Amin et al. (2025), Journal of Drugs in Dermatology, pooled multiple trials in 60 participants and found oral hyaluronic acid improved skin hydration and elasticity and reduced wrinkle depth versus placebo with good tolerability and no significant safety concerns; it was ranked 9th out of 20 for skin health supplements. Limitations include small sample sizes and limited trial numbers.',
  evidence_score = 66,
  how_to_use = 'Typical dose is 100-200 mg daily with water. Consistent use for 4-8 weeks is usually needed for noticeable benefits.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 100-200 mg daily with water.',
    'parser_method', 'explicit_range',
    'per_intake_max_value', 200,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Hyaluronic Acid (Oral)'
  and status = 'approved';

update public.supplements
set
  description = 'A carbohydrate involved in cell signalling that is mainly used to support insulin sensitivity, ovulation, and menstrual regularity in PCOS.',
  what_is_it = 'Inositol is a carbohydrate often referred to as vitamin B8 that is involved in cellular signalling. The most relevant forms are myo-inositol (MI) and D-chiro-inositol (DCI), which act as secondary messengers for hormones such as insulin, TSH, and FSH.',
  why_use_it = 'Primarily used for PCOS to improve insulin sensitivity, restore ovulation, and regulate menstrual cycles. It is also used for metabolic health, blood sugar control, and may support mood in anxiety or depression.',
  how_does_it_work = 'Inositol enhances insulin signalling and glucose uptake. In PCOS, impaired conversion of MI to DCI contributes to insulin resistance. Supplementation, ideally in a 40:1 MI:DCI ratio, helps restore insulin sensitivity, reduce circulating insulin, lower androgen production, and support ovulation.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal symptoms such as nausea, bloating, and gas may occur, particularly at higher doses above 12 g/day. Typical therapeutic doses of 2-4 g/day are well tolerated and often better accepted than metformin.',
  risks_and_interactions = 'May increase the risk of hypoglycaemia when combined with diabetes medications, so blood glucose should be monitored. High doses may affect mood stability in bipolar disorder, so specialist advice is recommended.',
  who_might_benefit = 'Women with PCOS, especially those with insulin resistance, individuals with metabolic syndrome, and those seeking non-hormonal support for ovulation and hormonal balance.',
  evidence = 'Unfer et al. (2017), Gynecological Endocrinology, meta-analysis of nine studies with 496 women with PCOS, found myo-inositol alone or with D-chiro-inositol for at least 24 weeks improved ovulation and periods and reduced insulin resistance and testosterone while increasing SHBG; ranked 1st of 13 for female hormone balance, with evidence limited by the underlying trial quality and heterogeneity. Minambres et al. (2019), Nutrition Research Reviews, systematic review and meta-analysis pooling 1,239 participants, found inositol lowered fasting and 2-hour post-glucose blood sugar without changing HbA1c or body weight and with no serious side effects; ranked 11th of 27 for blood sugar control, with outcomes mainly reflecting insulin sensitivity rather than long-term glycaemic change. Mukai et al. (2013), Human Psychopharmacology, meta-analysis of 11 studies in 312 people with depression or anxiety, found no clear benefit over placebo though there was a small signal for depression and premenstrual mood symptoms; ranked 17th of 18 for mood support, with limited and mixed evidence.',
  evidence_score = 75,
  how_to_use = 'Typical dose is 2-4 g daily of myo-inositol. For PCOS, use a 40:1 myo-inositol to D-chiro-inositol ratio. Consistent use for 3-6 months is required.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('typical_dose', 'daily', 'myo-inositol', 'pcos_ratio_mentioned'),
    'confidence', 0.95,
    'source_text', 'Typical dose: 2-4 g daily of myo-inositol. For PCOS: Use a 40:1 myo-inositol to D-chiro-inositol ratio.',
    'parser_method', 'manual',
    'per_intake_max_value', 4,
    'per_intake_min_value', 2,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Inositol (Myo-Inositol, D-Chiro-Inositol)'
  and status = 'approved';

update public.supplements
set
  description = 'An essential trace mineral that supports thyroid hormone production, metabolism, and reproductive health.',
  what_is_it = 'Iodine is an essential trace mineral required for thyroid hormone production, which regulates metabolism, growth, and development. It is obtained from seafood, seaweed, dairy, eggs, and iodised salt, and is included in many multivitamins and prenatal supplements. Iodine deficiency remains the world''s leading cause of preventable brain damage, and women trying to conceive with low iodine have nearly a 46% lower chance of conception each cycle.',
  why_use_it = 'Used to prevent or correct iodine deficiency and support normal thyroid function, energy levels, and metabolism. It is particularly important in pregnancy, where adequate iodine supports fetal brain and nervous system development and maternal thyroid health.',
  how_does_it_work = 'Iodine is incorporated into thyroid hormones (T3 and T4), which act throughout the body to regulate metabolic rate, temperature, and reproductive function. Adequate levels support ovulation, endometrial health, and fetal neurodevelopment, while both deficiency and excess can disrupt these processes.',
  side_effects = 'At recommended doses, iodine is usually well tolerated. Excess intake may cause gastrointestinal upset, metallic taste, or thyroid dysfunction.',
  risks_and_interactions = 'Changes in iodine intake can affect thyroid function, especially in those with thyroid disease. Both deficiency and excess are harmful. Deficiency increases risk of hypothyroidism and adverse pregnancy outcomes, while excess may trigger thyroid dysfunction. Those with thyroid conditions or on thyroid medication should seek medical advice before supplementing. High doses, such as from kelp, should be avoided unless medically supervised.',
  who_might_benefit = 'Women planning pregnancy, pregnant or breastfeeding women, individuals with low dietary iodine intake, vegans, and those avoiding dairy or seafood.',
  evidence = 'Mills et al. (2018), Human Reproduction, a population-based prospective cohort study in 501 women trying to conceive found that clear iodine deficiency was associated with about a 46% lower chance of conception each cycle versus adequate iodine status; the entry ranked this study 4th out of 9 for female fertility supplements, but the evidence is limited to observational data.',
  evidence_score = 43,
  how_to_use = 'Typical dose is 100-150 micrograms daily. In pregnancy and lactation, total daily intake is around 220-250 micrograms. Avoid high doses unless medically supervised.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'micrograms',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 100-150 micrograms daily. Pregnancy / lactation: Around 220-250 micrograms total daily intake.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 150,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Iodine'
  and status = 'approved';

update public.supplements
set
  description = 'An essential mineral used to support oxygen transport and energy production, especially when iron stores are low.',
  what_is_it = 'Iron is an essential mineral required for haemoglobin and myoglobin production, enabling oxygen transport in blood and muscle. Supplements are available as ferrous sulphate, bisglycinate, or heme iron forms.',
  why_use_it = 'Primarily used to treat iron deficiency anaemia with fatigue and low energy. Also used in non-anaemic iron deficiency, particularly in endurance athletes, to improve fatigue, recovery, and performance.',
  how_does_it_work = 'Iron enables oxygen delivery to tissues for ATP production. Adequate iron stores support mitochondrial function and enzymes involved in energy metabolism. In athletes, ferritin levels above 30-50 ng/mL are often targeted for optimal performance.',
  side_effects = 'Common side effects include constipation, nausea, abdominal discomfort, and dark stools. Chelated forms such as bisglycinate or alternate-day dosing may improve tolerability and absorption by reducing hepcidin-related inhibition.',
  risks_and_interactions = 'Risk of iron overload - supplement only with confirmed deficiency. Excess iron accumulates in organs and can be harmful. Absorption is reduced by calcium, coffee, and tea. Exercise increases hepcidin, reducing absorption, so timing matters.',
  who_might_benefit = 'Endurance athletes, especially women, vegetarians and vegans, and individuals with fatigue and confirmed low ferritin below 30 ng/mL.',
  evidence = 'Verdon et al. (2003), BMJ, double-blind randomized placebo-controlled trial in 144 non-anaemic women with unexplained tiredness found 80 mg iron daily for 4 weeks reduced fatigue more than placebo, with benefit limited to women with low-normal iron stores up to ferritin 50 ug/L; ranked 4th out of 21 for energy-enhancing supplements, with the main limitation that benefit was not seen in women without low iron stores.',
  evidence_score = 71,
  how_to_use = 'Typical dose is 45-65 mg elemental iron daily or on alternate days. Take with vitamin C to enhance absorption. Avoid taking with coffee, tea, or dairy. Best taken in the morning or away from training.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg elemental iron',
    'flags', jsonb_build_array('alternate-day dosing mentioned', 'take with vitamin C', 'avoid coffee tea dairy', 'morning or away from training'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 45-65 mg elemental iron daily or on alternate days.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 65,
    'per_intake_min_value', 45,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Iron'
  and status = 'approved';

update public.supplements
set
  description = 'A semi-essential amino acid supplement that supports nitric oxide production and blood flow.',
  what_is_it = 'L-arginine is a semi-essential amino acid found in foods such as meat and dairy. It acts as a precursor for nitric oxide (NO), as well as creatine and polyamines, and is available as a supplement in powders or capsules. L-arginine is the body''s primary source of nitric oxide - the molecule that relaxes blood vessels, lowers blood pressure, and drives the muscle pump during exercise.',
  why_use_it = 'Used to support cardiovascular health, improve blood pressure and endothelial function, enhance erectile function (often combined with other compounds), support exercise performance, and aid wound healing.',
  how_does_it_work = 'L-arginine is the main substrate for nitric oxide synthase (NOS), producing nitric oxide, which relaxes blood vessels and improves blood flow. This supports blood pressure regulation and vascular health. It also contributes to creatine synthesis and cellular repair processes.',
  side_effects = 'Generally well tolerated at lower doses (1-3 g/day). Mild gastrointestinal symptoms such as nausea, bloating, or diarrhoea may occur at higher doses. May exacerbate herpes simplex outbreaks in susceptible individuals.',
  risks_and_interactions = 'Can have additive effects with blood pressure medications and PDE5 inhibitors, increasing risk of hypotension. Avoid in recent myocardial infarction or unstable angina. Safety in pregnancy at higher doses is unclear.',
  who_might_benefit = 'Individuals with hypertension or vascular dysfunction, those with mild erectile dysfunction, athletes seeking improved blood flow during exercise, and individuals needing support for wound healing.',
  evidence = 'Rhim et al. (2019), Journal of Sexual Medicine, a systematic review and meta-analysis of 10 randomized trials in 540 men found oral L-arginine 1,500-5,000 mg/day improved erectile function scores versus placebo, especially in mild to moderate erectile dysfunction and when combined with other supplements; ranked 4th of 10 for male sexual arousal supplements. Dong et al. (2011), American Heart Journal, a meta-analysis of 11 randomized double-blind placebo-controlled trials in 387 participants found 4-24 g/day lowered blood pressure by about 5 mmHg systolic and 3 mmHg diastolic, with similar effects in studies longer than 4 weeks; ranked 3rd of 20 for blood pressure control supplements. Viribay et al. (2020), Nutrients, a systematic review and meta-analysis of 15 trials found L-arginine helped endurance-type performance, especially in untrained or moderately active people, but did not reliably improve maximum strength or very short all-out efforts; ranked 7th of 26 for endurance enhancing supplements. Schnieder et al. (2019), Advances in Skin & Wound Care, a systematic review found arginine drinks of about 4.5-9 g daily added to usual nutrition helped pressure sores heal faster and shrink more in older adults, but evidence for arginine alone was limited; ranked 3rd of 5 for injury recovery supplements. Rodrigues-Krause et al. (2018), Journal of the American Heart Association, a systematic review and meta-analysis of 22 trials in adults at heart risk found improved vessel widening, lower systolic and diastolic blood pressure, and reduced LDL cholesterol with no major short-term safety problems; ranked 5th of 18 for cardiovascular health supplements. Pasa et al. (2022), F1000Research, a systematic review and meta-analysis found acute pre-exercise L-arginine did not improve maximum strength, one-rep max, or strength-endurance in healthy adults, with benefits limited mainly to some endurance tests; ranked 18th of 20 for strength enhancing supplements.',
  evidence_score = 78,
  how_to_use = 'Vascular support: 1-3 g/day. Exercise: 2-3 g pre-workout. Higher doses for blood pressure require medical supervision. Consistent use is needed.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Vascular support: 1-3 g/day. Exercise: 2-3 g pre-workout.',
    'parser_method', 'rule_based',
    'per_intake_max_value', 3,
    'per_intake_min_value', 1,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'L-Arginine'
  and status = 'approved';

update public.supplements
set
  description = 'L-carnitine is a compound that helps transport fatty acids into mitochondria for energy production and is used for energy, recovery, weight management, and male fertility support.',
  what_is_it = 'L-carnitine is a compound synthesised from lysine and methionine that is essential for transporting fatty acids into mitochondria for energy production. It is found in animal foods and is also available as supplements such as acetyl-L-carnitine (ALCAR) and L-carnitine L-tartrate.',
  why_use_it = 'Used to support energy metabolism, reduce fatigue, enhance fat oxidation and weight management, improve exercise recovery, support cardiovascular and mitochondrial health, provide neuroprotection (ALCAR), and improve male fertility.',
  how_does_it_work = 'L-carnitine transports long-chain fatty acids into mitochondria for beta-oxidation and ATP production. It also reduces accumulation of toxic metabolites, supports mitochondrial function, and reduces oxidative stress. ALCAR additionally supports acetylcholine production and brain function.',
  side_effects = 'Generally well tolerated at standard doses. Mild gastrointestinal upset, nausea, or diarrhoea may occur. Some individuals may notice a fishy body odour due to metabolite formation. Higher doses increase the risk of gastrointestinal effects.',
  risks_and_interactions = 'High doses may increase TMAO levels, a potential cardiometabolic risk marker. Use caution in kidney disease and seek medical supervision. Generally safe in healthy individuals.',
  who_might_benefit = 'Vegetarians and vegans, older adults, individuals with fatigue, athletes seeking recovery support, and those targeting fat metabolism or fertility.',
  evidence = 'Evidence is strongest for male fertility and exercise recovery. Wei et al. (2021), Andrology, found that in 8 randomised trials with 693 men, L-carnitine or L-acetylcarnitine significantly improved sperm concentration, progressive motility, and normal morphology without major safety concerns, ranking 1st of 6 for male fertility. Ma et al. (2025), International Journal of Andrology, found in 7 randomised trials with 700 infertile men that L-carnitine increased serum testosterone and improved sperm measures without major safety concerns, ranking 2nd of 9 for testosterone enhancement. Yarizadh et al. (2020), Journal of Strength and Conditioning Research, found across 7 trials that L-carnitine reduced next-day muscle soreness and muscle damage markers for up to 96 hours after exercise, ranking 3rd of 9 for exercise recovery. Pooyandjoo et al. (2016), Obesity Reviews, found across 9 studies with 911 people that it produced a small additional weight loss of about 1.3 kg and a small BMI reduction, especially in overweight and obese adults with diet and exercise, ranking 6th of 22 for weight management. Malaguarnera et al. (2007), American Journal of Clinical Nutrition, found in 66 very old adults with severe tiredness that 2 g daily for 6 months reduced fatigue and improved walking distance and muscle mass, but generalisability was unclear, ranking 17th of 21 for energy enhancement. Askarpour et al. (2019), High Blood Pressure & Cardiovascular Prevention, found only a slight diastolic blood pressure reduction of about 1 mmHg with no systolic effect, so it is not considered effective for high blood pressure, ranking 17th of 20 for blood pressure control.',
  evidence_score = 84,
  how_to_use = 'Typical dose is 1-3 g daily, divided with meals. ALCAR is typically 500-2,000 mg daily for cognitive support. Effects on energy and metabolism typically require 2-4 weeks of consistent use.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('divided_with_meals'),
    'confidence', 0.92,
    'source_text', 'Typical dose: 1-3 g daily, divided with meals. ALCAR: 500-2,000 mg daily for cognitive support.',
    'parser_method', 'manual',
    'per_intake_max_value', 3,
    'per_intake_min_value', 1,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'L-Carnitine'
  and status = 'approved';

update public.supplements
set
  description = 'A non-essential amino acid used to support nitric oxide production, blood flow, exercise performance, and erectile function.',
  what_is_it = 'L-citrulline is a non-essential amino acid found in foods like watermelon. It is a precursor to L-arginine in the urea cycle and is sold as L-citrulline or L-citrulline malate.',
  why_use_it = 'It is used to support vascular health, improve blood flow and blood pressure, enhance exercise performance, reduce fatigue, and support erectile function. It has better bioavailability than L-arginine.',
  how_does_it_work = 'L-citrulline is converted into L-arginine in the body, which increases nitric oxide production more effectively than direct arginine supplementation. This promotes vasodilation and improved blood flow. The malate component may support ATP production and reduce exercise-related fatigue.',
  side_effects = 'Very well tolerated across a wide dose range. Mild gastrointestinal discomfort may occur at higher doses, but adverse effects are rare even with larger intakes.',
  risks_and_interactions = 'May have additive blood pressure-lowering effects when combined with antihypertensives or PDE5 inhibitors. Use caution in individuals with herpes simplex (HSV). Generally safe, but consult a clinician if underlying kidney disease is present.',
  who_might_benefit = 'Individuals with hypertension or vascular dysfunction, strength and power athletes, men with mild erectile dysfunction, and those seeking sustained nitric oxide support.',
  evidence = 'Cormio et al. (2011, Urology) found that 1.5 g daily for one month improved erection hardness and intercourse frequency in 24 men with mild erectile dysfunction, with no reported side effects, but the study was small. Trexler et al. (2019, Sports Medicine) reviewed 12 studies with 198 people and found 6-8 g taken shortly before exercise gave a small, meaningful boost to high-intensity strength performance, especially multi-rep sets, with little effect on true one-rep-max strength. Harnden et al. (2023, Sports Medicine - Open) reviewed 13 trials in healthy young adults and found no clear endurance benefit overall, with only a few small 7-day loading studies showing modest effects. Rhim et al. (2020, Journal of the International Society of Sports Nutrition) reviewed 13 trials with 206 people and found citrulline taken about 1 hour before exercise lowered perceived exertion and reduced next-day muscle soreness, though soreness benefits mostly faded by 72 hours.',
  evidence_score = 75,
  how_to_use = 'Typical dose is 1.5-6 g daily. For pre-workout use, 6-8 g of citrulline malate is taken before exercise. For erectile dysfunction, around 1.5 g daily has been studied.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('range', 'multiple_indications'),
    'confidence', 0.95,
    'source_text', 'Typical dose: 1.5-6 g daily. Pre-workout (malate): 6-8 g taken before exercise. For erectile dysfunction: Around 1.5 g daily.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 8,
    'per_intake_min_value', 1.5,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'L-Citrulline'
  and status = 'approved';

update public.supplements
set
  description = 'L-glutamine is a conditionally essential amino acid that supports gut, immune, and recovery needs during stress or illness.',
  what_is_it = 'L-glutamine is the most abundant amino acid in the body and becomes conditionally essential during stress or illness. It is a key fuel source for immune cells and intestinal cells and is available in protein-rich foods and supplements. During intense exercise, illness, or surgery, the body''s demand for glutamine can exceed its ability to produce it, making supplementation particularly valuable during periods of high physiological stress.',
  why_use_it = 'Used to support immune function, enhance recovery from intense exercise, maintain gut health and intestinal barrier integrity, reduce muscle breakdown, and support recovery during periods of high physiological stress such as illness, surgery, or heavy training.',
  how_does_it_work = 'L-glutamine fuels immune cells such as lymphocytes and macrophages, supporting immune defence and IgA production. It helps maintain intestinal tight junctions, supporting gut barrier function. It also acts as a nitrogen carrier for metabolism and contributes to glutathione production, aiding antioxidant defence.',
  side_effects = 'Very well tolerated across typical doses. Mild gastrointestinal symptoms such as bloating or discomfort may occur. Effects are gradual and depend on consistent intake.',
  risks_and_interactions = 'Use caution in severe liver disease. May require medical supervision in certain cancers. Generally safe in healthy individuals, though high-dose safety in pregnancy is unclear.',
  who_might_benefit = 'Athletes undergoing high training stress, individuals recovering from injury or surgery, those with gut health concerns, people with weakened immunity, and older adults aiming to preserve muscle mass.',
  evidence = 'Evidence is mixed but generally supportive for specific uses: Zhou et al. (2018, Gut) found that 5 g three times daily for 8 weeks improved symptoms and gut permeability in 106 adults with post-infectious IBS-D, though generalizability was limited; Yang et al. (2021, Frontiers in Immunology) reported in 15 trials of colorectal cancer surgery patients that glutamine improved immune markers and reduced wound and gut leak complications with a slight hospital stay reduction; Gholamalizadeh et al. (2021, JPEN) found across 16 trials a modest CRP reduction without consistent IL-6 or TNF-alpha changes; Mansour et al. (2015, Nutrition) reported in 66 adults with type 2 diabetes that 30 g/day for 6 weeks improved several cardiometabolic markers; and Hasani et al. (2021, Diabetology & Metabolic Syndrome) found across 12 trials small improvements in fasting glucose and CRP but limited effects on other risk factors. Overall rankings ranged from silver to gold, with benefits strongest for digestive and immune support and limitations including small trials and inconsistent broader metabolic effects.',
  evidence_score = 63,
  how_to_use = 'Typical dose: 5-20 g daily in divided doses. Athletes: 5-10 g post-exercise. Gut or immune support: 5-10 g daily.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 5-20 g daily in divided doses. Athletes: 5-10 g post-exercise. Gut / immune support: 5-10 g daily.',
    'parser_method', 'direct_text_parse',
    'per_intake_max_value', 10,
    'per_intake_min_value', 5,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'L-Glutamine'
  and status = 'approved';

update public.supplements
set
  description = 'A tea-derived amino acid supplement that may promote calm focus, reduce stress, and support sleep.',
  what_is_it = 'L-theanine is a non-protein amino acid found in tea leaves that crosses the blood-brain barrier and influences neurotransmitter activity. It is commonly available as a supplement in doses of 50-200 mg. L-theanine and caffeine is one of the most well-studied natural combinations in cognitive science - theanine smooths caffeine''s jitteriness while preserving and even enhancing its focus-boosting effects.',
  why_use_it = 'Used to promote relaxation without sedation, improve focus and cognition, especially with caffeine, reduce anxiety, enhance sleep quality, and support overall brain health.',
  how_does_it_work = 'L-theanine increases levels of calming neurotransmitters such as GABA, serotonin, and dopamine. It promotes alpha brain wave activity, associated with a calm but alert mental state. It also smooths the stimulatory effects of caffeine, reducing jitteriness while preserving focus, and may support neuroplasticity.',
  side_effects = 'Very well tolerated. Rare side effects include mild headache, gastrointestinal discomfort, or drowsiness at higher doses. Some individuals may experience vivid dreams when taken at night.',
  risks_and_interactions = 'May interact with medications affecting serotonin, dopamine, or GABA. Mild blood pressure-lowering effects - use caution with antihypertensives. Safety in pregnancy at supplemental doses is not well established.',
  who_might_benefit = 'Individuals with stress or anxiety, students and professionals seeking improved focus, those sensitive to caffeine, and people wanting better sleep quality.',
  evidence = 'Baba et al. (2021), Journal of Medicinal Food, found that a single 100 mg dose improved attention and working memory in 69 Japanese adults aged 50-69, with some benefits maintained after 12 weeks; Hidese et al. (2019), Nutrients, reported that 200 mg/day for 4 weeks reduced anxiety, low mood, and sleep problems in 34 highly stressed healthy adults; Cotter et al. (2025), Nutritional Neuroscience, concluded from a systematic review that about 200-400 mg/day may slightly improve subjective sleep and sleep onset but objective results are mixed; Moulin et al. (2024), Neurology and Therapy, found that 400 mg/day for 28 days lowered stress ratings and improved sleep quality and attention in 30 adults with moderate stress. Overall evidence is moderate to strong for calm focus, stress relief, and modest sleep support, with limitations including small samples and mixed objective sleep findings.',
  evidence_score = 59,
  how_to_use = 'Typical dose: 50-200 mg per dose. For focus: 100-200 mg with caffeine. For sleep: 100-200 mg taken 30-60 minutes before bed.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.98,
    'source_text', 'Typical dose: 50-200 mg per dose. For focus: 100-200 mg with caffeine. For sleep: 100-200 mg taken 30-60 minutes before bed.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 200,
    'per_intake_min_value', 50,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'L-Theanine'
  and status = 'approved';

update public.supplements
set
  description = 'A medicinal mushroom used for cognitive and neurological support, especially for memory, focus, and brain health.',
  what_is_it = 'Lion''s mane (Hericium erinaceus) is a medicinal mushroom containing bioactive compounds called hericenones and erinacines. It is available as powders, capsules, and standardised extracts for cognitive and neurological support.',
  why_use_it = 'Used to support memory, focus, and mental clarity, enhance neuroplasticity, reduce cognitive decline, improve mood, and provide general brain health and neuroprotective benefits. It is often used as a long-term cognitive support supplement rather than for immediate stimulation.',
  how_does_it_work = 'Lion''s mane stimulates production of nerve growth factor (NGF), which supports neuron growth, repair, and survival. This may enhance synaptic plasticity, myelination, and overall brain function. It also reduces neuroinflammation and oxidative stress, both linked to cognitive decline and mood disorders.',
  side_effects = 'Very well tolerated in most individuals. Rare side effects include mild gastrointestinal upset or skin irritation. Some users report mild tingling sensations, though this is uncommon and not harmful.',
  risks_and_interactions = 'Use caution in individuals with mushroom allergies. May have mild blood-thinning effects, so caution is advised with anticoagulants. Its immune-modulating properties may interact with immunosuppressive medications.',
  who_might_benefit = 'Individuals with brain fog or mild cognitive decline, students and professionals seeking focus, older adults concerned with cognitive ageing, and those looking for mood and resilience support.',
  evidence = 'Saitsu et al. (2019), Biomedical Research, studied 31 adults with reduced focus and found 12 weeks of Lion''s Mane extract improved concentration and mental speed; it ranked 8th out of 9 for concentration enhancing supplements, with the main limitation being the small trial size. Opanuga et al. (2024), American Journal of Natural Medicines, reviewed six human trials in 184 participants and found Lion''s Mane generally improved thinking test scores, slowed cognitive decline, or improved mood with good safety; it ranked 7th out of 24 for cognitive support supplements, though the evidence was based on a small number of heterogeneous studies. Bizjak Pražnikar et al. (2024), Clinical Nutrition ESPEN, reported that 8 weeks of erinacine A-rich Lion''s Mane in 33 older adults improved non-verbal thinking-speed measures related to working memory and processing speed; it ranked 16th out of 20 for memory enhancing supplements, with limitations including pilot size and short duration.',
  evidence_score = 54,
  how_to_use = 'Typical dose: 500 mg-3 g daily of standardised extract. Acute effects may be noticed within an hour, but cognitive benefits typically require 4-8 weeks of consistent use.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardised extract'),
    'confidence', 0.86,
    'source_text', 'Typical dose: 500 mg-3 g daily of standardised extract.',
    'parser_method', 'range_extraction',
    'per_intake_max_value', 3000,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Lion''s Mane'
  and status = 'approved';

update public.supplements
set
  description = 'An Andean root supplement used mainly for libido, mood, and gentle adaptogenic support.',
  what_is_it = 'Maca (Lepidium meyenii) is an Andean root vegetable traditionally used for energy, mood, and sexual health. It is available as powder or capsules, with gelatinised forms preferred due to improved digestibility and reduced goitrogen content.',
  why_use_it = 'Used to support libido and sexual function, especially in menopause or mild erectile dysfunction, improve mood and well-being, and provide general adaptogenic support. Some people also report digestive benefits, though evidence is limited.',
  how_does_it_work = 'Mechanisms are not fully understood. Maca appears to influence neurotransmitters and endocannabinoid pathways involved in mood and libido. It may also exert mild adaptogenic effects on the HPA axis, helping the body respond to stress. It does not significantly alter testosterone or oestrogen levels.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal discomfort or insomnia may occur.',
  risks_and_interactions = 'Gelatinised maca is preferred because it reduces compounds that may interfere with thyroid function and improves absorption. Caution in individuals with thyroid disorders - use gelatinised forms and ensure adequate iodine intake. May interact with hormone-sensitive conditions or medications.',
  who_might_benefit = 'Menopausal women experiencing low libido or mood changes, men with mild erectile dysfunction or low desire, and individuals seeking gentle adaptogenic support.',
  evidence = 'Human trials and reviews suggest maca may modestly improve sexual function, mood, and energy without major hormone changes. Zenico et al. (2009), Andrologia, found 2.4 g/day for 12 weeks improved erection scores and sexual well-being in 50 men with mild erectile dysfunction, ranked 9th of 10 for male sexual arousal. Meissner et al. (2005), International Journal of Biomedical Science, reported mixed but modest menopausal symptom and hormone effects in 168 early postmenopausal women, ranked 9th of 13 for female hormone balance. Stojanovska et al. (2015), Climacteric, found 3.3 g/day for 12 weeks reduced depression scores and diastolic blood pressure in 29 postmenopausal women without changing hormones, ranked 13th of 18 for mood support. Gonzales-Arimborgo et al. (2016), High Altitude Medicine & Biology, found 3 g/day red or black maca for 12 weeks improved energy, mood, and health status in 175 adults at high altitude, ranked 6th of 21 for energy enhancing. Chen et al. (2024), Frontiers in Pharmacology, concluded maca is generally well tolerated at 1.5-3.5 g/day for 6-12 weeks with only mild gut symptoms and no solid evidence for specific digestive disorders, ranked 12th of 13 for digestive health. Brooks et al. (2008), Plant Foods for Human Nutrition, found 3.5 g/day for 6 weeks improved anxiety, depression, and sexual function in 29 postmenopausal women without changing key sex hormones, ranked 3rd of 7 for female sexual arousal. Limitations across studies include small samples, short durations, and mixed results.',
  evidence_score = 58,
  how_to_use = 'Typical dose is 1.5-3 g daily, preferably gelatinised. Take with food to improve tolerance. Effects on mood and libido typically require 6-12 weeks of consistent use.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('daily', 'prefer_gelatinised', 'take_with_food'),
    'confidence', 0.96,
    'source_text', 'Typical dose: 1.5-3 g daily (gelatinised form preferred). Timing: Take with food to improve tolerance.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 3,
    'per_intake_min_value', 1.5,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Maca Root'
  and status = 'approved';

update public.supplements
set
  description = 'A well-tolerated magnesium supplement form used for relaxation, sleep, metabolic support, and, in the L-threonate form, cognitive support.',
  what_is_it = 'Magnesium glycinate is magnesium bound to glycine, offering high absorption and good tolerability. Magnesium L-threonate is a specialised form designed to cross the blood-brain barrier and increase brain magnesium levels. Glycinate supports whole-body magnesium status, while L-threonate is more targeted toward cognitive effects.',
  why_use_it = 'Magnesium supports relaxation of the nervous system and muscles, making it useful for stress reduction and improving sleep quality. It also plays key roles in energy production, blood sugar regulation, bone health, and hormonal balance, including in PCOS. L-threonate may provide additional benefits for memory, focus, and cognitive performance.',
  how_does_it_work = 'Magnesium regulates NMDA and GABA activity, promoting calmness and neuronal stability. Glycinate improves absorption via amino acid transport. L-threonate increases brain magnesium levels, supporting synaptic plasticity, learning, and memory formation.',
  side_effects = 'Very well tolerated. Glycinate minimises the laxative effects seen with other forms. Mild drowsiness can occur, especially when taken in the evening.',
  risks_and_interactions = 'May interfere with absorption of certain antibiotics and bisphosphonates - separate dosing by 2-4 hours. Use caution in severe kidney disease.',
  who_might_benefit = 'Glycinate: individuals with stress, poor sleep, or low magnesium intake. L-threonate: older adults, students, or those seeking cognitive support.',
  evidence = 'Evidence is strongest for sleep, stress, blood sugar control, bone health, and cognitive support. Mah et al. (2021, BMC Complementary Medicine and Therapies) pooled three randomised trials in 151 older adults with insomnia and found oral magnesium improved insomnia severity and reduced sleep onset latency by about 17 minutes versus placebo, though effects on total sleep time and efficiency were small and uncertain; ranked 4th of 11 for sleep support. Boyle et al. (2017, Nutrients) reviewed 18 human studies and found several trials in anxious, premenstrual, and hypertensive participants reported reduced anxiety with magnesium; ranked 3rd of 15 for stress relief. Xu (2023, Frontiers in Nutrition) pooled 24 randomised controlled trials and found about 300-400 mg/day magnesium lowered fasting blood sugar, HbA1c, and HOMA-IR in type 2 diabetes, especially in low-magnesium patients or with at least 90 days of use; ranked 13th of 27 for blood sugar control. Rondanelli et al. (2021, Nutrients) reported that low magnesium intake is linked to lower bone density and more fractures, and in postmenopausal women with osteoporosis supplements increased bone density in 71% and prevented further loss in another 16%; ranked 6th of 10 for bone health. Alam et al. (2025, Neuroscience Letters) found 6 weeks of magnesium L-threonate improved overall thinking scores, working and episodic memory, reaction time, and estimated brain age in healthy adults, but the evidence is early and based on a single trial; ranked 2nd of 20 for memory enhancing. Al-Ghazali et al. (2020, Frontiers in Aging Neuroscience) observed in 1,000 Qatari adults that higher blood magnesium was linked to faster reaction time, especially in women with high blood pressure or diabetes, but this was observational; ranked 8th of 24 for cognitive support. Askari et al. (2020, Critical Reviews in Food Science and Nutrition) found across 32 adult studies that magnesium slightly reduced BMI, with stronger effects in obese or insulin-resistant people; ranked 11th of 22 for weight management. Farsinejad-Marj et al. (2020, Biological Trace Element Research) reported that 250 mg/day magnesium oxide for 8 weeks in 60 women with PCOS lowered BMI and testosterone and raised DHEA versus placebo, suggesting possible hormonal and metabolic benefits; ranked 7th of 13 for female hormone balance. Overall, benefits appear most consistent in people with low magnesium status or specific clinical needs, while cognitive claims for L-threonate remain promising but limited.',
  evidence_score = 78,
  how_to_use = 'Sleep or stress: 175-500 mg/day. Blood sugar or metabolic support: 280-430 mg/day for 3-4 months. Memory support with L-threonate: around 2 g/day for 6 weeks.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('multiple_indications', 'mixed_forms'),
    'confidence', 0.86,
    'source_text', 'Sleep / stress: 175-500 mg/day. Blood sugar / metabolic: 280-430 mg/day for 3-4 months. Memory (L-threonate): Around 2 g/day for 6 weeks.',
    'parser_method', 'manual',
    'per_intake_max_value', 2000,
    'per_intake_min_value', 175,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Magnesium (Glycinate & L-Threonate)'
  and status = 'approved';

update public.supplements
set
  description = 'A hormone supplement used to help reset the body clock and improve sleep timing.',
  what_is_it = 'Melatonin is a hormone produced by the pineal gland that regulates the sleep-wake cycle. Supplemental melatonin is usually synthetic and taken to signal the body that it is time for sleep.',
  why_use_it = 'Used to manage insomnia, jet lag, shift-work sleep disruption, and delayed sleep-wake phase disorder. It may also help reduce pre-operative anxiety and support sleep in certain neurological or visual conditions.',
  how_does_it_work = 'Melatonin binds to MT1 and MT2 receptors in the suprachiasmatic nucleus, the brain''s body clock. This helps shift circadian timing, reduce sleep-onset latency, and align sleep patterns with desired bedtimes.',
  side_effects = 'Generally well tolerated for short-term use. Possible side effects include daytime sleepiness, dizziness, headache, nausea, and vivid dreams. Higher doses are more likely to cause grogginess the next day.',
  risks_and_interactions = 'May interact with anticoagulants, immunosuppressants, and sedative medications. Not routinely recommended during pregnancy or breastfeeding. Long-term safety in children is uncertain and should be supervised. Melatonin is a prescription-only medication in the UK.',
  who_might_benefit = 'Adults with insomnia, jet lag, or delayed sleep phase, shift workers with disrupted sleep schedules, and children with neurodevelopmental sleep disorders under medical guidance.',
  evidence = 'Ferracioli-Oda et al. (2013), PLoS ONE, meta-analysis of 19 trials with 1,683 people with sleep problems found melatonin 0.1-5 mg for up to 6 months helped people fall asleep about 7 minutes faster, sleep 8 minutes longer, and sleep better overall with no sign of tolerance; it was ranked 1st out of 11 for sleep support, with the main limitation that the average benefits were modest. Repova et al. (2022), International Journal of Molecular Sciences, reviewed clinical and animal studies and found melatonin lowered anxiety before and after surgery and may work about as well as benzodiazepines, but the evidence was broader and less direct for specific anxiety disorders and was ranked 14th out of 15 for stress relief.',
  evidence_score = 82,
  how_to_use = 'Typical dose: 0.5-5 mg taken 30-60 minutes before bed. Lower doses are often effective and better tolerated. Timing is critical for circadian rhythm adjustment.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 0.5-5 mg taken 30-60 minutes before bed.',
    'parser_method', 'explicit_range',
    'per_intake_max_value', 5,
    'per_intake_min_value', 0.5,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Melatonin (Prescription Medication in UK)'
  and status = 'approved';

update public.supplements
set
  description = 'A sweet clover extract used to support venous and lymphatic circulation and reduce swelling.',
  what_is_it = 'Melilotus officinalis (sweet clover) is a yellow-flowered legume used as a vascular and lymphatic support herb. Extracts are made from the aerial parts and standardised for coumarins and flavonoids, which are the key active compounds.',
  why_use_it = 'Used to support chronic venous insufficiency, reduce leg heaviness and swelling, and assist in mild lymphoedema. It is often used alongside compression, elevation, and physical therapies for venous and lymphatic conditions, and may also help symptoms of varicose veins or haemorrhoids.',
  how_does_it_work = 'Coumarins appear to enhance lymphatic drainage and venous return by improving capillary permeability and promoting clearance of protein-rich fluid from tissues. Flavonoids contribute anti-inflammatory and mild venotonic effects, supporting vessel function and reducing fluid accumulation.',
  side_effects = 'Generally well tolerated at standard doses. Mild gastrointestinal upset or headache may occur.',
  risks_and_interactions = 'Because of its coumarin content, products are standardised for safety. Persistent or worsening swelling should always be medically assessed. May increase bleeding risk, particularly when combined with anticoagulants or antiplatelet medications. Avoid in bleeding disorders, before surgery, and during pregnancy or breastfeeding. Use caution in liver disease.',
  who_might_benefit = 'Adults with mild to moderate venous insufficiency, heavy or swollen legs, or early lymphoedema already using compression and exercise.',
  evidence = 'Michelini et al., 2019, Lymphology, studied 52 patients with stage I-II lymphoedema and found that 6 months of melilotus 100 mg plus rutin 300 mg and bromelain 100 mg daily reduced limb circumference by 4.2 cm, eliminated pitting oedema in 72% of cases, and decreased tissue thickness by 29% with no major side effects; this was ranked 5th of 8 for lymphatic/swelling support and is limited by the combination formula and lack of melilotus-only data.',
  evidence_score = 30,
  how_to_use = 'Typical dose: 200-400 mg daily of standardised extract, taken with food. Use consistently for weeks to months with periodic review. Seek medical advice if at risk of bleeding or with underlying conditions.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Typical dose: 200-400 mg daily of standardised extract, taken with food.',
    'parser_method', 'extracted_from_text',
    'per_intake_max_value', 400,
    'per_intake_min_value', 200,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Melilotus (Sweet Clover) Extract'
  and status = 'approved';

update public.supplements
set
  description = 'A synthetic compound used medically and explored at low doses as a niche nootropic and mitochondrial support agent.',
  what_is_it = 'Methylene blue is a synthetic compound historically used as a dye and medication, including for methemoglobinaemia. At low doses, it is being explored as a niche nootropic and mitochondrial support agent.',
  why_use_it = 'It is primarily used in experimental or specialist settings to support mitochondrial function, cellular energy, and brain health. Some research explores its role in improving memory, attention, and cognitive resilience, but it is not a mainstream supplement.',
  how_does_it_work = 'At low doses, methylene blue can act as an alternative electron carrier in the mitochondrial respiratory chain, supporting ATP production and reducing oxidative stress. This may enhance cellular energy efficiency and protect neurons.',
  side_effects = 'Even at low doses, side effects can include nausea, headache, dizziness, restlessness, sweating, and blue-green urine, which is harmless. Higher doses may impair mitochondrial function and increase adverse effects.',
  risks_and_interactions = 'Methylene blue is a potent MAO-A inhibitor and can cause life-threatening serotonin syndrome when combined with SSRIs, SNRIs, or other serotonergic drugs. Use extreme caution in G6PD deficiency, cardiovascular disease, and pregnancy. Medical supervision is essential.',
  who_might_benefit = 'Primarily a research or specialist-use compound for selected individuals under medical supervision. For healthy individuals, the risk-benefit balance is uncertain compared with safer alternatives.',
  evidence = 'Evidence is limited and mixed across small human and preclinical studies. Xiong et al. (2017) in Scientific Reports found that very low-dose methylene blue improved ageing markers, cell growth, mitochondrial ROS, and skin structure in lab-grown human skin models, but this was laboratory research only and ranked 14th of 15 for anti-ageing. Rodriguez et al. (2016) in Radiology reported that 26 healthy adults given one low dose showed stronger brain scan signals during memory tasks and about 7% more correct answers on short-term memory tests, but the study was small and ranked 19th of 20 for memory enhancing. Klosowski et al. (2020) in Ageing found in isolated rat liver mitochondria that methylene blue altered energy metabolism in both helpful and harmful ways, but this was animal and mitochondrial research only and ranked 21st of 21 for energy enhancing. Auchter et al. (2014) in Journal of Alzheimer''s Disease found improved learning and memory in rats with chronic cerebral hypoperfusion, but this was animal research only and ranked 23rd of 24 for cognitive support.',
  evidence_score = 9,
  how_to_use = 'Research doses are around 0.5-4 mg/kg orally under strict medical supervision. No standard wellness protocol exists, and pharmaceutical-grade product and clinical oversight are essential.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg/kg',
    'flags', jsonb_build_array('research dose', 'oral', 'medical supervision required'),
    'confidence', 0.86,
    'source_text', 'Around 0.5-4 mg/kg orally under strict medical supervision.',
    'parser_method', 'range_extraction',
    'per_intake_max_value', 4,
    'per_intake_min_value', 0.5,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Methylene Blue'
  and status = 'approved';

update public.supplements
set
  description = 'Milk thistle is a seed extract used mainly to support liver health and provide antioxidant effects.',
  what_is_it = 'Milk thistle (Silybum marianum) is a plant whose seeds contain silymarin, a group of flavonolignans with antioxidant properties. It is commonly used as a standardised extract in capsules or tablets for liver support.',
  why_use_it = 'Primarily used to support liver health in conditions such as non-alcoholic fatty liver disease, alcohol-related liver injury, and toxin exposure. It is also marketed for general antioxidant support. Some limited evidence suggests benefits in inflammatory joint conditions.',
  how_does_it_work = 'Silymarin acts as a potent antioxidant, scavenging free radicals and increasing antioxidant enzymes such as glutathione and superoxide dismutase. It stabilises liver cell membranes, reduces lipid peroxidation, modulates inflammation, and may support liver cell regeneration and antifibrotic pathways.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal symptoms such as nausea, diarrhoea, and bloating are most common. Rarely, headache or itching may occur.',
  risks_and_interactions = 'Those with allergies to Asteraceae plants such as ragweed should use caution. It may affect liver enzyme systems including CYP2C9 and CYP3A4 and drug transporters, potentially altering levels of medications such as warfarin, statins, or immunosuppressants. Safety in pregnancy and breastfeeding is unclear.',
  who_might_benefit = 'Adults with mild-to-moderate liver disease seeking adjunctive support, individuals with toxin exposure under supervision, and possibly those with inflammatory joint conditions.',
  evidence = 'Evidence is moderate overall. Mirzaei et al. (2022), Scientific Reports, found that 280 mg/day silymarin for 12 weeks reduced IL-6 and endometrioma size in 60 women with ovarian endometriosis, but this was a small single-condition trial and ranked 19th of 19 for immune health. Zugravu et al. (2024), Medicina, reported that 300 mg/day for 8 weeks improved joint symptoms in 122 people with active rheumatoid arthritis, though it was a pilot study and ranked 9th of 15 for joint health. Behari et al. (2024), Inflamopharmacology, found in a meta-analysis of 15 randomised trials in 1,012 adults that silymarin reduced CRP, IL-6, and oxidative stress while increasing antioxidant defences, but the included studies were mostly in diabetes or thalassaemia and ranked 7th of 38 for anti-inflammatory supplements.',
  evidence_score = 63,
  how_to_use = 'Typical dose is 140-210 mg 2-3 times daily, for a total of 280-420 mg/day of standardised extract. Use for 8-24 weeks alongside lifestyle changes.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardised_extract', 'per_intake_estimated'),
    'confidence', 0.95,
    'source_text', 'Typical dose: 140-210 mg, 2-3 times daily (total 280-420 mg/day standardised extract).',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 210,
    'per_intake_min_value', 140,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 2
  ),
  dose_scoring_profile_json = null
where name = 'Milk Thistle'
  and status = 'approved';

update public.supplements
set
  description = 'MSM is a sulfur-containing supplement commonly used to support joint comfort, mobility, and connective tissue health.',
  what_is_it = 'MSM (methylsulfonylmethane) is a sulfur-containing compound available as a supplement in powders or capsules. It is commonly used to support joint health, mobility, and connective tissue.',
  why_use_it = 'MSM is used to reduce joint pain and stiffness, support cartilage and connective tissue, improve exercise recovery, and provide background support for hair, skin, and nail health.',
  how_does_it_work = 'MSM provides sulfur, a key component for collagen and keratin synthesis, supporting joint structures and hair integrity. It also has anti-inflammatory and antioxidant effects, which may reduce joint inflammation and support tissue repair.',
  side_effects = 'Generally well tolerated. Mild side effects at higher doses may include gastrointestinal discomfort, headache, or sleep disturbance. Starting with a lower dose and increasing gradually can improve tolerance.',
  risks_and_interactions = 'Long-term high-dose safety data are limited. Caution is advised in individuals with significant medical conditions or those taking multiple medications, though no major interactions are well established.',
  who_might_benefit = 'Adults with mild-to-moderate osteoarthritis or joint discomfort, active individuals seeking improved recovery, and those supporting hair and connective tissue health.',
  evidence = 'Toguchi et al. (2023), Nutrients, found that MSM 2,000 mg daily for 12 weeks improved arthritis scores and reduced several pain measures in 88 adults with mild knee pain; it was ranked 7th of 15 for joint health supplements, with the main limitation being a relatively small study population. Benjamin et al. (2024), Natural Medicine Journal, reported that MSM 1,000 mg daily for 120 days increased hair density and thickness in 41 adults with telogen effluvium and was ranked 7th of 11 for hair health supplements, though the evidence base remains limited.',
  evidence_score = 61,
  how_to_use = 'Typical dose is 1,000-3,000 mg daily, taken with food. Increase gradually over 1-2 weeks and use consistently for at least 8-12 weeks before assessing benefit.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 1,000-3,000 mg daily, taken with food.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 3000,
    'per_intake_min_value', 1000,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'MSM (Methylsulfonylmethane)'
  and status = 'approved';

update public.supplements
set
  description = 'Neem oil is a topical plant oil used for skin and pest control, while neem leaf extract is an oral supplement studied mainly for blood sugar support.',
  what_is_it = 'Neem oil is a strong-smelling seed oil from Azadirachta indica used as a natural pesticide and in topical skincare. Neem leaf extract is a water- or alcohol-based leaf extract used orally for blood sugar, immune, and inflammatory support. Neem oil must never be taken orally because it is toxic when ingested, especially in children.',
  why_use_it = 'Neem oil is used on skin for acne, oiliness, dandruff, and minor irritation, and as a plant-based insect repellent. Neem leaf extract is taken orally as an adjunct for blood sugar control, metabolic health, and broader anti-inflammatory and immune support.',
  how_does_it_work = 'Topical neem oil supplies limonoids and fatty acids with antimicrobial and anti-inflammatory effects, reducing acne-causing organisms and sebum. Orally, neem leaf extract improves blood sugar and insulin resistance and exerts systemic anti-inflammatory, antioxidant, and antimicrobial actions.',
  side_effects = 'Topical neem oil is generally safe short-term on intact skin but can cause irritation or allergy. Oral neem leaf extract is usually tolerated at studied doses but can cause gastrointestinal upset, headache, and blood sugar lowering.',
  risks_and_interactions = 'Neem oil must not be ingested because it has no role as an oral supplement and is linked to serious toxicity. Avoid use on broken skin, mucous membranes, and in pregnancy or young children. Neem leaf extract can enhance blood sugar-lowering drugs, increasing hypoglycaemia risk.',
  who_might_benefit = 'Topical neem oil may help people with oily or acne-prone skin or mild dandruff. Neem leaf extract may suit adults with impaired glucose control or metabolic syndrome as an adjunct, not as a replacement for standard therapies.',
  evidence = 'Evidence is limited but promising for specific uses. Pingali et al. (2020) in Diabetes, Metabolic Syndrome and Obesity studied 80 adults with type 2 diabetes on metformin and found 12 weeks of aqueous neem leaf extract (250-1,000 mg/day) dose-dependently lowered HbA1c, fasting and post-meal glucose, insulin resistance, hs-CRP, and IL-6 without hypoglycaemia or major safety issues; it ranked 20th of 27 for blood sugar control and 26th of 38 for anti-inflammatory supplements, with a modest sample size and adjunct-only design. Nesari et al. (2021) in Alternative Therapies in Health and Medicine reported that 50 mg neem leaf extract twice daily for 28 days in 190 high-risk healthcare workers reduced COVID-19 infection risk by 55% and increased protective IgG without raising CRP; it ranked 13th of 19 for immune health, but it was a pilot trial. Yogesh et al. (2022) in Journal of Cosmetic Dermatology found a neem face wash in 120 people with mild to moderate acne or oily skin reduced new inflamed and non-inflamed spots and skin oil over 4 weeks with no reported side effects; it ranked 19th of 20 for skin health, but the product was a face wash rather than oral neem.',
  evidence_score = 19,
  how_to_use = 'Topical neem oil: Apply diluted oil around 0.5-2% in a carrier to intact skin once or twice daily after a patch test. Never take by mouth. Oral neem leaf extract: 500-1,000 mg/day divided with food, under medical guidance.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('oral', 'divided_with_food'),
    'confidence', 0.86,
    'source_text', '500-1,000 mg/day divided with food, under medical guidance.',
    'parser_method', 'manual',
    'per_intake_max_value', 500,
    'per_intake_min_value', 250,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 2
  ),
  dose_scoring_profile_json = null
where name = 'Neem Oil / Neem Leaf Extract'
  and status = 'approved';

update public.supplements
set
  description = 'A standardised extract from stinging nettle root that is mainly used for urinary symptoms of benign prostatic hyperplasia and sometimes as an adjunct for rheumatoid arthritis.',
  what_is_it = 'Nettle root (Urtica dioica) is derived from the underground portion of the stinging nettle plant and is traditionally used for urinary and inflammatory conditions. It is typically taken as a standardised extract in capsules or tablets.',
  why_use_it = 'Primarily used to relieve urinary symptoms of benign prostatic hyperplasia (BPH), including weak stream, urgency, frequency, and incomplete emptying. It may also be used alongside standard treatments in rheumatoid arthritis to help reduce joint pain, swelling, and inflammation.',
  how_does_it_work = 'Nettle root appears to influence hormone-related pathways in the prostate, including interactions with sex hormone-binding globulin and local growth factors, which may reduce prostate-related obstruction. It also has anti-inflammatory effects, helping reduce cytokines such as IL-17 and markers such as CRP.',
  side_effects = 'Generally well tolerated with few side effects. Mild gastrointestinal upset, skin irritation, or itching may occur.',
  risks_and_interactions = 'Any new or worsening urinary symptoms should be medically assessed to exclude serious causes. Long-term safety data are limited. Use caution in kidney disease or when taking multiple medications. May interact with prostate medications, anti-inflammatories, or immunosuppressants. Not a replacement for standard rheumatoid arthritis treatment.',
  who_might_benefit = 'Men with mild-to-moderate BPH symptoms under medical care, and individuals with rheumatoid arthritis seeking adjunctive support under specialist guidance.',
  evidence = 'Men et al. (2016), African Journal of Traditional, Complementary and Alternative Medicine, systematic review and meta-analysis of 5 trials with 1,128 men found 360-600 mg/day nettle root for several weeks clearly improved urinary symptom scores, increased urine flow, and slightly reduced prostate size versus placebo; ranked 3rd out of 7 for urinary health, with evidence limited by short trial durations and standard study limitations. Abd-Nikfarjam et al. (2022), Journal of Herbal Medicine, in 90 rheumatoid arthritis patients on standard drugs, adding nettle for 3 months lowered disease activity, pain scores, and inflammatory markers IL-17 and CRP versus placebo and evening primrose oil, with no reported side effects; ranked 31st out of 38 for anti-inflammatory supplements, but the evidence is smaller and adjunctive.',
  evidence_score = 61,
  how_to_use = 'Typical dose is 360-600 mg daily of a standardised extract. Use consistently for 8-12 weeks. For joint support, similar dosing may be used for up to 3 months under supervision.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardised extract'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 360-600 mg daily (standardised extract).',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 600,
    'per_intake_min_value', 360,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Nettle Root'
  and status = 'approved';

update public.supplements
set
  description = 'Forms of vitamin B3 that support NAD+ production, with nicotinamide best supported for skin cancer prevention and niacin used medically for cholesterol management.',
  what_is_it = 'Nicotinamide riboside (NR), niacinamide (nicotinamide), and niacin are forms of vitamin B3 that help build NAD+, a molecule essential for energy production, DNA repair, and cellular resilience. Niacin is traditionally used for cholesterol management, while nicotinamide is widely used for skin and anti-inflammatory support. NR is a newer form studied in ageing and metabolic health.',
  why_use_it = 'Nicotinamide is used to reduce non-melanoma skin cancer risk in high-risk individuals and support skin health. B3 forms may also support joint health, reduce inflammation, and provide metabolic or cognitive support, although these benefits are modest. High-dose niacin is used under medical supervision to improve cholesterol profiles.',
  how_does_it_work = 'All forms increase NAD+ levels, supporting mitochondrial energy production, redox balance, and cellular repair pathways. Nicotinamide enhances DNA repair and reduces UV-induced skin damage. NR increases NAD+ efficiently and may support anti-inflammatory pathways. Niacin directly affects liver lipid metabolism.',
  side_effects = 'Nicotinamide and NR are generally well tolerated, with mild gastrointestinal symptoms or headache possible. Niacin commonly causes flushing and itching, and may affect blood sugar and liver enzymes.',
  risks_and_interactions = 'High doses may stress the liver. Niacin can worsen glucose control and interact with statins. Caution in liver disease, diabetes, and with hepatotoxic medications. Specialist guidance advised for high doses.',
  who_might_benefit = 'Individuals at high risk of skin cancer, older adults seeking healthy ageing support, and selected patients with dyslipidaemia under medical care.',
  evidence = 'Evidence is strongest for nicotinamide in skin health: Mainville et al. (2022), Journal of Cutaneous Medicine and Surgery, a systematic review and meta-analysis of 29 studies in 3,039 patients found significant reductions in total skin cancers, basal-cell and squamous-cell carcinomas, and actinic keratoses with no increase in serious side effects and only a small rise in minor digestive issues; this was ranked 1st out of 20 for skin health, though the broader B3 evidence is mixed, with modest or negative findings for cognition, endurance, and energy, while niacin improved lipids in AIM-HIGH but did not reduce cardiovascular events.',
  evidence_score = 76,
  how_to_use = 'Nicotinamide: 500 mg twice daily (clinical use). NR: 250-500 mg twice daily. Niacin: Specialist-prescribed gram doses; standard intake 15-20 mg daily.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('multiple_forms', 'mixed_regimens', 'standard_intake_included'),
    'confidence', 0.86,
    'source_text', 'Nicotinamide: 500 mg twice daily (clinical use). NR: 250-500 mg twice daily. Niacin: Specialist-prescribed gram doses; standard intake 15-20 mg daily.',
    'parser_method', 'manual',
    'per_intake_max_value', 500,
    'per_intake_min_value', 15,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Nicotinamide Riboside / Niacinamide / Niacin (B3)'
  and status = 'approved';

update public.supplements
set
  description = 'NMN is a vitamin B3-derived supplement that helps raise NAD+ levels and may support energy, aging, and exercise-related outcomes.',
  what_is_it = 'NMN (nicotinamide mononucleotide) is a compound derived from vitamin B3 and a direct precursor to NAD+, a molecule essential for cellular energy production, DNA repair, and metabolic regulation. It is available as a supplement in doses higher than typically obtained from diet.',
  why_use_it = 'NMN is used to increase NAD+ levels, which decline with age. It is marketed to support energy levels, mitochondrial function, exercise performance, and aspects of healthy ageing. Some people also use it for metabolic and vascular support, although human evidence is still developing.',
  how_does_it_work = 'NMN is converted into NAD+ within cells, supporting mitochondrial ATP production, redox balance, and cellular repair processes. It also activates pathways involved in stress response and ageing, including sirtuins, and may help reduce oxidative stress and low-grade inflammation.',
  side_effects = 'Generally well tolerated in short-term studies up to around 1,200 mg daily. Mild side effects may include nausea, abdominal discomfort, flushing, or headache. Long-term safety remains unclear.',
  risks_and_interactions = 'Limited human safety data. Theoretical concerns include effects on tumour biology and interactions with metabolic or mitochondrial pathways. Avoid use in active cancer or during chemotherapy without specialist input.',
  who_might_benefit = 'Middle-aged or older adults seeking support for energy, recovery, or metabolic health. Benefits in younger, healthy individuals are unclear.',
  evidence = 'Liao et al. 2022, Frontiers in Aging, multicentre randomized double-blind placebo-controlled trial in 66 healthy adults aged 40-65 found 300 mg/day NMN for 60 days raised blood NAD+ levels, slightly lowered or maintained biological age versus placebo, and improved quality-of-life scores; ranked 10th of 15 for anti-ageing supplements, with short duration and small sample size. Kim et al. 2022, Nutrients, study in 108 adults aged 65 and over found 250 mg/day NMN for 12 weeks, especially taken in the afternoon, reduced drowsiness, unsteadiness, mental dullness, and overall fatigue and improved lower-limb function versus morning dosing and placebo; ranked 5th of 21 for energy enhancing supplements. Wen et al. 2024, Cureus, systematic review of 10 randomized controlled trials in 437 adults found NMN for 4-24 weeks mainly improved endurance outcomes such as gait speed, 6-minute walk distance, chair-stand performance, ventilatory-threshold power, and SF-36 physical function, while strength gains were small and non-significant; ranked 4th of 26 for endurance enhancing supplements.',
  evidence_score = 62,
  how_to_use = 'Typical dose: 250-600 mg daily, often taken in the morning with food. Some studies use up to 1,200 mg daily. Most trials run for 4-12 weeks.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 250-600 mg daily, often taken in the morning with food. Some studies use up to 1,200 mg daily.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 600,
    'per_intake_min_value', 250,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'NMN (Nicotinamide Mononucleotide)'
  and status = 'approved';

update public.supplements
set
  description = 'Omega-3 fatty acids are marine fats commonly taken as fish oil or algae supplements to support heart, brain, mood, and inflammatory health.',
  what_is_it = 'Omega-3 fatty acids (EPA and DHA) are long-chain polyunsaturated fats found mainly in oily fish and marine sources. They are key components of cell membranes, particularly in the brain, eyes, and cardiovascular system, and are commonly taken as fish oil or algae-based supplements.',
  why_use_it = 'Omega-3s are used to support heart health, reduce inflammation, and improve cognitive function, mood, and stress resilience. They are also used for joint comfort, skin and hair health, and to support metabolic markers such as blood pressure, cholesterol, and blood sugar.',
  how_does_it_work = 'EPA and DHA incorporate into cell membranes, improving membrane fluidity and function. They shift inflammatory signalling toward anti-inflammatory and pro-resolving pathways. They also influence neurotransmission, endothelial function, and immune responses, supporting brain, cardiovascular, and metabolic health.',
  side_effects = 'Generally well tolerated at typical doses. Mild side effects include fishy aftertaste, reflux, or gastrointestinal discomfort. Higher doses may increase bleeding tendency.',
  risks_and_interactions = 'Quality and freshness vary between products. May enhance the effects of anticoagulants or antiplatelet medications. Caution advised before surgery or in bleeding disorders. Choose high-quality, third-party tested products to reduce risk of oxidation or contaminants.',
  who_might_benefit = 'Individuals with low fish intake, those with cardiovascular risk factors, inflammatory joint conditions, mood concerns, or metabolic dysfunction, as well as pregnant women and older adults.',
  evidence = 'Evidence is broad and strong across multiple outcomes: Shahinafer et al. (2025, Scientific Reports) found omega-3 improved memory and visuospatial skills in nearly 15,000 adults and ranked 1st of 24 for cognitive support, though benefits varied by dose; Bos et al. (2015, Neuropsychopharmacology) found 650 mg/day improved parent-rated attention in a 16-week trial of 40 boys and ranked 7th of 9 for concentration; Kiecolt-Glaser et al. (2011, Brain, Behavior, and Immunity) found 2.5 g/day reduced anxiety and IL-6 in 68 medical students and ranked 1st of 15 for stress relief; Xu et al. (2022, Age and Ageing) found 4 g/day improved muscle outcomes in 200 older adults and ranked 8th of 20 for strength; Deng et al. (2023, Journal of Orthopaedic Surgery and Research) found reduced osteoarthritis pain and better function across 9 trials and ranked 4th of 15 for joint health; Miller et al. (2014, American Journal of Hypertension) found small blood pressure reductions across 70 trials, especially at 2 g/day or more, and ranked 6th of 20 for blood pressure; Yurko-Mouro et al. (2015, PLOS ONE) found doses above 1 g/day improved episodic memory in adults, especially those with complaints, and ranked 3rd of 20 for memory; Khan et al. (2021, eClinicalMedicine) found reduced cardiovascular events across 38 trials but also higher atrial fibrillation and bleeding risk, ranking 1st of 18 for cardiovascular health; Kavyani et al. (2022, Nutrients) found lower CRP, TNF-alpha, and IL-6 across 32 studies, especially at 2 g/day or more, ranking 2nd of 38 for anti-inflammatory effects; Safarinejad et al. (2012, Journal of Andrology) found 1.84 g/day improved sperm measures in 238 infertile men and ranked 2nd of 6 for male fertility; Mumford et al. (2024, Human Reproduction) found improved pregnancy and fertilisation outcomes across 13 studies in women and ranked 2nd of 9 for female fertility; Norouziasl et al. (2024, British Journal of Nutrition) found improved depressive symptoms in people with existing depression, especially with antidepressants, and ranked 5th of 18 for mood support. Limitations include variable dose-response, mixed effects in healthy populations, and product quality differences.',
  evidence_score = 95,
  how_to_use = 'General health: 1-2 g daily EPA+DHA. Inflammation, blood pressure, or mood: 2-3 g daily EPA+DHA. Best taken with meals containing fat.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('EPA+DHA', 'daily', 'with meals containing fat'),
    'confidence', 0.96,
    'source_text', 'General health: 1-2 g daily EPA+DHA. Inflammation / BP / mood: 2-3 g daily EPA+DHA. Note: Best taken with meals containing fat.',
    'parser_method', 'direct_range_extraction',
    'per_intake_max_value', 3,
    'per_intake_min_value', 1,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Omega-3'
  and status = 'approved';

update public.supplements
set
  description = 'Panax ginseng is an adaptogenic root herb used to support energy, stress resilience, cognition, mood, and sexual function.',
  what_is_it = 'Panax ginseng (Asian/Korean ginseng) is an adaptogenic herb derived from the root of the plant, containing active compounds called ginsenosides. It is typically used as a standardised extract to support cognitive performance, energy, mood, and sexual function.',
  why_use_it = 'Panax ginseng is used to support concentration, memory, and mental performance, particularly during periods of stress or fatigue. It may also improve mood, reduce perceived stress, and support sexual function, including erectile function and arousal in both men and women.',
  how_does_it_work = 'Ginsenosides influence neurotransmitters such as dopamine and serotonin, as well as neurotrophic factors involved in brain function. It modulates the HPA axis, helping the body respond to stress. It also enhances nitric oxide production, improving blood flow relevant to cognition and sexual performance.',
  side_effects = 'Generally well tolerated. Possible side effects include insomnia, nervousness, headache, or gastrointestinal upset, particularly at higher doses or if taken late in the day. Starting at a lower dose may improve tolerance.',
  risks_and_interactions = 'May interact with anticoagulants, diabetes medications, and psychoactive drugs. Use caution in individuals with uncontrolled hypertension, arrhythmias, or hormone-sensitive conditions. Not recommended during pregnancy or breastfeeding without medical advice.',
  who_might_benefit = 'Adults experiencing fatigue, stress, or cognitive demands, as well as individuals seeking support for mild erectile dysfunction or reduced sexual function.',
  evidence = 'Evidence is mixed but generally supportive for fatigue, stress, mood, cognition, and sexual function. Yeo et al. (2012) in Journal of Ginseng Research found 4,500 mg/day Korean Red Ginseng for 2 weeks reduced P300 latency in 15 healthy young adults but did not improve computerized attention or motor tasks, ranked 9th of 9 for concentration. Bell et al. (2022) in Nutritional Neuroscience found 200 mg American ginseng improved self-rated mental fatigue and self-assurance in 61 healthy adults over 2 weeks, ranked 9th of 18 for mood. Zhu et al. (2022) in Medicine (Baltimore) pooled 12 randomized trials in 1,298 patients and found a small but real reduction in disease-related fatigue, ranked 3rd of 21 for energy. Hong et al. (2002) in Journal of Urology found 900 mg three times daily for 8 weeks improved erectile function in 45 men, ranked 8th of 10 for male sexual arousal. Kim et al. (2018) in Journal of Ginseng Research found 6 weeks of Korean Red Ginseng reduced stress scores in 63 adults, ranked 12th of 15 for stress. Park et al. (2019) in Translational and Clinical Pharmacology found 3 g/day for 6 months improved visual memory in 90 adults with mild cognitive impairment but not global cognition, ranked 14th of 20 for memory. Oh et al. (2010) in Journal of Sexual Medicine found 3 g/day for 8 weeks improved sexual arousal in 28 menopausal women, ranked 5th of 7 for female sexual arousal. Limitations include small trials, variable preparations and doses, and some outcomes showing only modest or selective benefits.',
  evidence_score = 59,
  how_to_use = 'Typical dose: 200-400 mg standardised extract daily. Best taken in the morning or early afternoon. Use for 4-12 weeks with periodic breaks.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardised extract', 'daily dose'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 200-400 mg standardised extract daily.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 400,
    'per_intake_min_value', 200,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Panax Ginseng'
  and status = 'approved';

update public.supplements
set
  description = 'An essential mineral needed for energy production, bone strength, and normal cell function.',
  what_is_it = 'Phosphate is an essential mineral (PO4 3-) involved in DNA and RNA structure, cell membranes, and energy production, and it is found in foods such as dairy, meat, and grains or in calcium, potassium, or sodium phosphate supplements.',
  why_use_it = 'Phosphate is used to support ATP production, bone strength, muscle contraction, and acid-base balance, but supplementation is usually reserved for correcting deficiency rather than general health use.',
  how_does_it_work = 'Phosphate combines with ADP to form ATP, binds with calcium to form hydroxyapatite in bone, acts as a buffer to help maintain pH balance, and supports cell signalling plus nerve and muscle function.',
  side_effects = 'Supplemental phosphate can cause gastrointestinal upset such as diarrhoea, nausea, and vomiting. Excess intake may disrupt calcium balance and contribute to cardiovascular risk, particularly in kidney disease.',
  risks_and_interactions = 'Can bind to calcium, magnesium, and aluminium-containing medications and reduce their absorption. May interfere with thyroid medications. Should be avoided or closely monitored in kidney disease, hyperphosphataemia, or parathyroid disorders.',
  who_might_benefit = 'People with confirmed phosphate deficiency, including those with malnutrition, alcoholism, or recovery from illness, and selected patients under medical supervision.',
  evidence = 'White et al. (2011), Journal of Clinical Endocrinology & Metabolism, found that several years of oral phosphate plus alendronate in adults with hypophosphataemic osteomalacia significantly increased lumbar spine and hip bone mineral density and improved bone pain and fracture risk markers versus baseline, but it was ranked 10th of 10 for bone health supplements and the evidence is limited by the specific deficiency population and baseline comparison design. Folland et al. (2008), Journal of Science and Medicine in Sport, reported that 6 days of sodium phosphate loading at 50 mg/kg/day in 6 trained male cyclists increased mean cycling power by about 10% and reduced 16.1 km time by about 3% versus placebo with no major side effects, but it was ranked 18th of 26 for endurance enhancing supplements and was limited by the very small sample size.',
  evidence_score = 41,
  how_to_use = 'Typical dietary intake is around 700 mg/day from food. Supplementation should only be used under medical supervision, taken with meals, and separated from calcium or magnesium supplements.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg/day',
    'flags', jsonb_build_array('dietary_intake'),
    'confidence', 0.86,
    'source_text', 'Typical dietary intake: Around 700 mg/day from food.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 700,
    'per_intake_min_value', 700,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Phosphate'
  and status = 'approved';

update public.supplements
set
  description = 'An essential choline source that supports cell membranes, acetylcholine production, and some digestive and cognitive functions.',
  what_is_it = 'Choline is an essential nutrient involved in cell membrane structure and neurotransmission. It is a precursor to phosphatidylcholine and acetylcholine, both critical for brain function. It is obtained from foods such as eggs, meat, and fish, or as supplements like phosphatidylcholine or alpha-GPC.',
  why_use_it = 'Choline is used to support memory, learning, and cognitive performance, particularly during ageing or high mental demand. It may also support brain resilience and gut barrier function.',
  how_does_it_work = 'Choline provides the substrate for acetylcholine synthesis, supporting attention and memory. It also contributes to phospholipid production, maintaining neuronal membranes. In the gut, phosphatidylcholine supports the protective mucus layer, reducing bacterial adhesion.',
  side_effects = 'Generally well tolerated. Higher intakes may cause gastrointestinal upset, sweating, low blood pressure, fishy body odour, or increased TMAO, a gut-derived metabolite linked to cardiovascular risk in some studies.',
  risks_and_interactions = 'Interacts with methyl donors such as folate and vitamin B12. Use caution in liver or kidney disease.',
  who_might_benefit = 'Older adults with low intake, individuals with cognitive demands, and those seeking gut support.',
  evidence = 'Evidence is mixed for cognitive support: Zajac et al. (2025), American Journal of Clinical Nutrition, found no significant cognitive benefit in 263 adults aged 55-75 after 16 weeks of 1.7 g or 4.0 g/day MFGM phospholipids, ranked 17th of 24 with a Bronze rating and limited by lack of effect on tests. For memory, Ladd et al. (1993), Clinical Neuropharmacology, reported that a single 25 g dose improved explicit serial-learning memory in 80 healthy college students 90 minutes after ingestion, ranked 15th of 20 with a Silver rating, but the finding has not been replicated recently. For ulcerative colitis, Stremmel et al. (2020), Inflammatory Bowel Diseases, meta-analyzed 3 trials in 160 patients and found delayed-release phosphatidylcholine improved remission, symptoms, colon appearance, tissue healing, and quality of life with placebo-like side effects, ranked 23rd of 38 with a Silver rating. Karner et al. (2014), American Journal of Gastroenterology, studied 156 adults with mesalazine-refractory ulcerative colitis and found modified-release phosphatidylcholine up to 3.2 g/day reduced clinical activity and roughly doubled remission rates, ranked 10th of 13 with a Silver rating.',
  evidence_score = 49,
  how_to_use = 'Prioritise dietary intake first, especially eggs, meat, and fish. Supplemental use should follow product guidance, and long-term dosing remains unclear.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array('dietary-first', 'long-term-dosing-unclear'),
    'confidence', 0.74,
    'source_text', 'modified-release phosphatidylcholine (up to 3.2 g/day)',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 3.2,
    'per_intake_min_value', null,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Phosphatidylcholine (Choline)'
  and status = 'approved';

update public.supplements
set
  description = 'A phospholipid supplement used to support memory, attention, and stress resilience.',
  what_is_it = 'Phosphatidylserine is a phospholipid found in high concentrations in brain cell membranes, where it supports membrane fluidity and communication between neurons. Supplements are typically derived from soy or sunflower sources. The US FDA has approved a qualified health claim for phosphatidylserine and cognitive function, but evidence is limited and it is not broadly approved for treating cognitive disorders.',
  why_use_it = 'Used to support memory, learning, attention, and overall cognitive performance, particularly in ageing. It is also used to support stress resilience by helping regulate cortisol levels and improve mental performance under pressure.',
  how_does_it_work = 'Phosphatidylserine helps maintain neuronal membrane structure and receptor function, supporting efficient neurotransmission and synaptic plasticity. It also modulates cortisol responses and influences dopamine and acetylcholine pathways involved in cognition and mood.',
  side_effects = 'Generally well tolerated at typical doses. Mild gastrointestinal upset, insomnia, or restlessness may occur, especially at higher doses or if taken late in the day.',
  risks_and_interactions = 'Use caution with medications affecting acetylcholine or dopamine. Soy-derived products may not be suitable for those with severe soy allergy.',
  who_might_benefit = 'Older adults with mild memory concerns, and individuals under high cognitive or occupational stress seeking focus or stress support.',
  evidence = 'Hellhammer et al. (2014), Lipids in Health and Disease, found that 42 days of 400 mg/day soy-phosphatidylserine plus phosphatidic acid lowered ACTH and cortisol responses to a lab stress test versus placebo in 75 healthy men, but only in those with high chronic stress; it ranked 13th of 15 for stress relief and was limited by subgroup-specific effects. Richter et al. (2013), Clinical Interventions in Aging, reported that 300 mg/day soy phosphatidylserine for 12 weeks improved memory recognition, recall, executive function, and mental flexibility in 30 adults aged 50-90 with memory complaints, ranking 16th of 24 for cognitive support, though the sample was small. Kato-Kataoka et al. (2010), Journal of Clinical Biochemistry and Nutrition, found that 100 mg or 300 mg/day soy phosphatidylserine for 6 months improved memory scores in 78 adults aged 50-69 with memory complaints, mainly in those with lower baseline performance, ranking 9th of 20 for memory enhancing supplements, with benefits concentrated in a subset of participants.',
  evidence_score = 50,
  how_to_use = 'Typical dose is 200-300 mg daily, often as 100 mg two to three times daily with meals. Use consistently for 6-12 weeks.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 200-300 mg daily, often as 100 mg two to three times daily with meals.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 100,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 2
  ),
  dose_scoring_profile_json = null
where name = 'Phosphatidylserine (PS)'
  and status = 'approved';

update public.supplements
set
  description = 'Plant compounds that can mildly mimic or modulate estrogen activity and are used mainly for menopause support.',
  what_is_it = 'Phytoestrogens are plant-derived compounds, mainly isoflavones and lignans, that have a structure similar to estradiol. They are found in foods such as soy and flaxseed and are also available as concentrated supplements.',
  why_use_it = 'They are used to support hormonal balance during menopause, helping reduce hot flushes and night sweats, support bone health, and potentially improve cardiometabolic and blood sugar markers in postmenopausal women.',
  how_does_it_work = 'They act as weak selective estrogen receptor modulators, so they can have mild estrogen-like or anti-estrogen effects depending on the tissue. This may influence hormone signalling, lipid and glucose metabolism, and inflammatory pathways.',
  side_effects = 'Generally well tolerated, especially from dietary sources. Supplements may cause mild gastrointestinal upset, headache, or menstrual changes. Effects vary depending on individual hormone status.',
  risks_and_interactions = 'Use caution in people with estrogen-sensitive conditions, unexplained vaginal bleeding, or those taking hormone therapies such as HRT or tamoxifen. They may also interact with thyroid medications.',
  who_might_benefit = 'Perimenopausal and postmenopausal women seeking non-hormonal support for symptoms or bone health, especially those preferring plant-based approaches.',
  evidence = 'Chen et al. (2015), Climacteric, a meta-analysis of 19 clinical trials in over 1,200 peri- and postmenopausal women, found that phytoestrogen supplements, mainly 30-80 mg/day soy isoflavones for at least 3 months, reduced hot flush frequency by about 20-25% without serious safety concerns or endometrial effects; it was ranked 4th out of 13 for female hormone balance, but the evidence is limited by trial variability. Inpan et al. (2024), Osteoporosis International, reported in 23 trials that isoflavone supplements, especially at least 50 mg/day genistein for 12 months or more, improved bone mineral density at the spine, hip, and wrist. Karamali et al. (2016), Molecular Nutrition & Food Research, found in 17 trials of 1,529 menopausal women that 40-100 mg/day soy isoflavones for 6-12 months modestly improved fasting glucose, insulin, and HOMA-IR, with genistein-only products most consistent. Yang et al. (2023), Advances in Nutrition, found in 23 trials that isoflavones lowered triglycerides and slightly raised HDL, with mixed LDL effects and stronger results in women under 65 treated for at least 24 weeks.',
  evidence_score = 65,
  how_to_use = 'Food-first approach: soy and flaxseed are the primary dietary sources. Supplemental dose: 40-80 mg isoflavones daily. Use for 8-12 weeks before reassessing effects.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg isoflavones',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Supplemental dose: 40-80 mg isoflavones daily.',
    'parser_method', 'direct_range_extraction',
    'per_intake_max_value', 80,
    'per_intake_min_value', 40,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Phytoestrogens'
  and status = 'approved';

update public.supplements
set
  description = 'A plant-derived protein powder used to help meet protein needs and support muscle and recovery, especially for dairy-free diets.',
  what_is_it = 'Plant protein powders are concentrated protein sources derived from plants such as pea, soy, rice, hemp, or blended combinations. They provide a dairy-free alternative to whey protein and are commonly used in plant-based or lactose-free diets.',
  why_use_it = 'Used to support muscle mass, strength, recovery, and overall protein intake. Particularly helpful for vegans, vegetarians, or individuals struggling to meet protein needs through diet alone.',
  how_does_it_work = 'Provides essential amino acids required for muscle protein synthesis and tissue repair. When formulations are balanced, especially for leucine content, they can support strength and muscle gains comparable to animal-based proteins.',
  side_effects = 'Generally well tolerated. Some individuals may experience bloating or gas, often due to added fibres or sweeteners. Taste and texture vary; blended products are often better tolerated.',
  risks_and_interactions = 'Quality varies between products, so third-party testing is recommended to check for contaminants such as heavy metals. Soy-based proteins are not suitable for those with allergies. High protein intake should be monitored in kidney disease.',
  who_might_benefit = 'Vegans, vegetarians, athletes, older adults, and anyone needing a convenient, dairy-free way to increase protein intake.',
  evidence = 'Reid-McCann et al. (2025), Nutrition Reviews, a systematic review and meta-analysis of 30 randomized trials with 2,433 participants, found plant protein produced slightly smaller muscle mass gains than animal protein overall but no meaningful difference in strength when total protein and training were similar; ranked 3rd of 20 for strength enhancing supplements, with limitations including product and formulation differences. Teixeira et al. (2022), Frontiers in Nutrition, in 40 male futsal players found 8 weeks of mixed plant protein or whey produced similar body composition, strength, power, and aerobic performance outcomes; ranked 22nd of 26 for endurance enhancing supplements, with a small sport-specific sample. Govindasamy et al. (2025), Nutrients, reviewed 24 trials of soy, pea, rice, hemp, potato, or mixed plant proteins (15-50 g after exercise) and found nine showed better recovery than low or no protein, with higher blends of at least 30 g and about 2.5 g leucine giving the clearest benefits; ranked 7th of 9 for exercise recovery supplements, with heterogeneity across protein sources and doses.',
  evidence_score = 74,
  how_to_use = 'Typical serving: 20-30 g protein per serving, 1 or more times daily depending on needs. Athletes: aim for around 1.6-2.2 g/kg/day total protein from all sources. Combine with resistance training for best results.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g protein',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical serving: 20-30 g protein per serving, 1 or more times daily depending on needs.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 30,
    'per_intake_min_value', 20,
    'frequency_max_per_day', null,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Plant Protein'
  and status = 'approved';

update public.supplements
set
  description = 'An oral antioxidant fern extract used to help protect skin from UV damage and sun-related redness.',
  what_is_it = 'A standardized extract from the tropical fern Polypodium leucotomos, rich in polyphenols such as chlorogenic, caffeic, and ferulic acids, used as an oral antioxidant supplement for skin protection.',
  why_use_it = 'Used to support skin health, reduce sun-induced redness, and help protect against UV-related DNA damage and photo-ageing, often alongside sunscreen in people with high sun exposure or photosensitive skin conditions.',
  how_does_it_work = 'Acts as a systemic antioxidant by scavenging free radicals generated by UV exposure, reducing inflammatory signaling, helping preserve DNA integrity in skin cells, and possibly improving the skin''s tolerance to UV radiation.',
  side_effects = 'Generally well tolerated at typical doses. Mild gastrointestinal upset may occur.',
  risks_and_interactions = 'It should not be used as a replacement for topical sunscreen or other sun protection measures. Caution is advised in individuals with autoimmune conditions or those taking immunosuppressive medications. Long-term safety data are limited, and product quality varies, so reputable brands are preferred.',
  who_might_benefit = 'Individuals with high sun exposure, photosensitivity such as polymorphous light eruption, or those undergoing phototherapy for conditions such as vitiligo or psoriasis, as well as people seeking additional skin ageing protection.',
  evidence = 'Goh et al. (2018), Journal of Clinical and Aesthetic Dermatology, reported in a double-blind, placebo-controlled trial of 40 adults with facial melasma that adding oral Polypodium leucotomos extract 480 mg/day for 12 weeks to sunscreen produced a larger reduction in melasma severity scores than placebo (about 49% vs 33%) and improved quality of life without serious side effects; the entry ranks this evidence 10th out of 20 for skin health supplements, but the study was small and focused on melasma rather than broad UV protection.',
  evidence_score = 37,
  how_to_use = 'Typical dose is 240-480 mg daily, usually taken in the morning. Start before periods of increased sun exposure and use for 6-8 weeks alongside standard sun protection.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 240-480 mg daily, usually taken in the morning.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 480,
    'per_intake_min_value', 240,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Polypodium Leucotomos Extract (PLE)'
  and status = 'approved';

update public.supplements
set
  description = 'An essential mineral and electrolyte that helps regulate nerve function, muscle contraction, fluid balance, and blood pressure.',
  what_is_it = 'Potassium is an essential mineral and electrolyte, and the main intracellular cation in the body. It plays a key role in nerve transmission, muscle contraction, fluid balance, and maintaining normal heart rhythm. Potassium is the dietary counterbalance to sodium - it helps to lower blood pressure.',
  why_use_it = 'Potassium is used to support blood pressure control, particularly in individuals with high sodium intake or salt-sensitive hypertension. It is also important for reducing stroke risk and maintaining proper cardiac and muscle function.',
  how_does_it_work = 'Potassium promotes vasodilation and helps relax blood vessel walls. It increases sodium excretion by the kidneys, counteracting the blood pressure-raising effects of sodium. It also supports normal electrical activity in nerves and muscles, including the heart.',
  side_effects = 'High potassium levels (hyperkalaemia) can be dangerous, causing abnormal heart rhythms or cardiac arrest, particularly in those with kidney disease or on certain medications. Healthy individuals usually regulate excess intake effectively through the kidneys.',
  risks_and_interactions = 'Can interact dangerously with ACE inhibitors, ARBs, and potassium-sparing diuretics, increasing risk of hyperkalaemia. Contraindicated in chronic kidney disease without medical supervision.',
  who_might_benefit = 'Individuals with hypertension, especially those with high sodium intake, and those at increased cardiovascular or stroke risk.',
  evidence = 'Poorolajal et al. (2017), PLOS ONE, meta-analysis of 23 placebo-controlled randomized trials in 1,213 adults with essential hypertension found oral potassium supplements of about 1,200-3,900 mg/day for at least 4 weeks lowered systolic blood pressure by roughly 4-5 mmHg and diastolic by 2-3 mmHg, with no meaningful kidney changes or serious side effects; ranked 4th out of 20 for blood pressure control supplements, but the evidence is limited to short-term trials.',
  evidence_score = 51,
  how_to_use = 'Dietary target: 3,500-4,700 mg daily from fruits and vegetables. Supplementation only under medical supervision with monitoring.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('dietary_target', 'medical_supervision_required'),
    'confidence', 0.86,
    'source_text', 'Dietary target: 3,500-4,700 mg daily from fruits and vegetables. Supplementation only under medical supervision with monitoring.',
    'parser_method', 'manual',
    'per_intake_max_value', 4700,
    'per_intake_min_value', 3500,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Potassium'
  and status = 'approved';

update public.supplements
set
  description = 'Non-digestible fibres that feed beneficial gut bacteria and may support digestion, immunity, and metabolic health.',
  what_is_it = 'Prebiotics are non-digestible fibres such as inulin, FOS, and GOS that feed beneficial gut bacteria. They are found in foods like onions, garlic, bananas, and whole grains, and are also sold as supplements.',
  why_use_it = 'They are used to support digestive health, improve gut microbiome balance, and enhance immune function. They may also support metabolic health, weight management, gut-brain communication, reduce inflammation, and help maintain gut barrier integrity.',
  how_does_it_work = 'Prebiotics are fermented by gut bacteria in the colon, producing short-chain fatty acids such as butyrate. These compounds can lower gut pH, inhibit harmful bacteria, improve mineral absorption, strengthen the intestinal barrier, and help regulate immune and metabolic pathways.',
  side_effects = 'Generally well tolerated, but rapid increases in intake can cause bloating, gas, or changes in bowel habits. Gradual introduction and adequate hydration may reduce these effects.',
  risks_and_interactions = 'May worsen symptoms in people with IBS or SIBO. Use caution with medications that affect gut motility or carbohydrate metabolism.',
  who_might_benefit = 'People with low fibre intake, gut imbalance, or metabolic concerns, as well as those seeking digestive or immune support.',
  evidence = 'Lomax et al., 2015, Frontiers in Immunology, found that 8 g/day of an inulin-type fructan for 8 weeks in 98 healthy adults aged 45-65 slightly improved antibody response to one influenza strain and altered some immune markers with no major side effects; ranked 17th of 19 for immune health and limited by modest effects. Silk et al., 2009, Alimentary Pharmacology & Therapeutics, found that 3.5 g/day trans-galactooligosaccharide for 12 weeks in 44 IBS patients increased bifidobacteria and reduced symptom scores versus placebo without worsening gas or discomfort; ranked 8th of 13 for digestive health. Visuthranukul et al., 2022, Scientific Reports, found that 8 g/day inulin for 1 year in 165 obese children did not improve BMI z-score or body fat versus placebo; ranked 21st of 22 for weight management, with earlier meta-analyses suggesting only small average adult effects.',
  evidence_score = 53,
  how_to_use = 'Typical dose is 2-10 g daily, starting low and increasing gradually. Take with food, and benefits usually appear after several weeks.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 2-10 g daily, starting low and increasing gradually.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 10,
    'per_intake_min_value', 2,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Prebiotics'
  and status = 'approved';

update public.supplements
set
  description = 'Live beneficial bacteria or yeasts that may support digestive, immune, metabolic, skin, urinary, and other health outcomes when taken in adequate amounts.',
  what_is_it = 'Probiotics are live beneficial bacteria or yeasts that support health when consumed in adequate amounts. They are found in fermented foods such as yogurt, kefir, and sauerkraut, and in supplements providing specific strains measured in CFU (colony-forming units).',
  why_use_it = 'Used to support digestive health and reduce symptoms such as bloating, diarrhoea, and discomfort, particularly in IBS. They may also reduce the frequency and duration of respiratory infections, support immune function, and provide benefits in metabolic health.',
  how_does_it_work = 'Probiotics help restore gut microbiome balance by competing with harmful microbes and producing antimicrobial compounds. They strengthen the gut barrier, reduce low-grade inflammation, and influence immune responses. They also affect digestion and gut signalling involved in appetite and metabolism.',
  side_effects = 'Generally well tolerated. Mild bloating, gas, or changes in stool may occur initially. Effects are typically modest and require consistent use.',
  risks_and_interactions = 'Rare risk of infection in severely immunocompromised or critically ill individuals. Take a few hours apart from antibiotics to improve effectiveness.',
  who_might_benefit = 'Individuals with IBS symptoms, those recovering from antibiotics, and people with metabolic conditions, frequent infections, or eczema.',
  evidence = 'Gold-rated evidence across 7 health categories. Li et al. (2020), Evidence-Based Complementary and Alternative Medicine, found in 6 trials with 1,551 adults that daily probiotics for 3-6 months reduced upper respiratory infections by about 23%, lowered cold frequency, and shortened illness by 2-3 days, with mild gut side effects; ranked 2nd out of 19 for immune health. Rinaldi et al. (2022), Dermatology and Therapy, found in 144 adults with mild-to-moderate acne that 8 weeks of oral probiotics plus standard topical therapy reduced inflammatory lesions by about 39%-57% versus 10% with placebo; ranked 3rd out of 20 for skin health. Garcia-Navarro et al. (2024), Nutrients, found in 136 adults with androgenetic alopecia that 16 weeks of a Lactiplantibacillus probiotic blend reduced shedding-phase hairs versus placebo with good tolerability; ranked 8th out of 11 for hair health. Rittiphairoj et al. (2021), Advances in Nutrition, found in 30 trials with 1,827 adults with type 2 diabetes that probiotics improved fasting glucose, HbA1c, insulin, and HOMA-IR, with larger effects in higher-BMI and Bifidobacterium-rich food-based products; ranked 8th out of 27 for blood sugar control. Borgeraas et al. (2017), Obesity Reviews, found in 15 trials with 957 overweight or obese adults that 3-12 weeks of probiotics produced small additional losses in body weight, BMI, and body fat; ranked 5th out of 22 for weight management. Gupta et al. (2024), Clinical Infectious Diseases, found in 174 premenopausal women with recurrent UTIs that 4 months of daily oral probiotics slightly reduced recurrences, while vaginal probiotics had the largest benefit; ranked 2nd out of 7 for urinary health. Zeng et al. (2025), Gastroenterology, found in an umbrella review of 15 review articles that probiotic supplements significantly reduced digestive symptoms, especially diarrhoea, nausea, bloating, and epigastric pain; ranked 1st out of 13 for digestive health. Limitations include strain-specific effects, generally modest benefits, and the need for consistent use.',
  evidence_score = 91,
  how_to_use = 'Typical dose: 1-100 billion CFU daily. Duration: Use for at least 4-12 weeks. Choose strain-specific products for your goal. Take consistently, usually with food.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'CFU',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 1-100 billion CFU daily.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 100000000000,
    'per_intake_min_value', 1000000000,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Probiotics'
  and status = 'approved';

update public.supplements
set
  description = 'A soluble fibre supplement that forms a gel in water and supports bowel regularity, cholesterol, and blood sugar control.',
  what_is_it = 'Psyllium is a soluble fibre derived from the husks of Plantago ovata seeds. It forms a gel when mixed with water and is commonly used as a powder or capsule for digestive and metabolic health.',
  why_use_it = 'Psyllium is used to promote regular bowel movements, relieve constipation, and support gut health. It can also help lower LDL cholesterol, improve blood sugar control, and increase satiety, supporting weight management and cardiovascular health.',
  how_does_it_work = 'Psyllium absorbs water in the gut to form a viscous gel, which softens and bulks stool, promoting regularity. This gel also slows gastric emptying, helping regulate blood glucose and appetite. It binds bile acids and cholesterol, reducing their reabsorption and lowering LDL levels.',
  side_effects = 'Generally well tolerated. Rapid increases in intake may cause bloating, gas, or discomfort. It must always be taken with adequate water to prevent choking or intestinal blockage. Rare allergic reactions can occur.',
  risks_and_interactions = 'May reduce absorption of medications - take at least 30 minutes to 2 hours apart. Avoid in individuals with swallowing difficulties or gastrointestinal obstruction. Use caution in kidney disease or fluid-restricted states.',
  who_might_benefit = 'Individuals with constipation, high cholesterol, type 2 diabetes or prediabetes, low fibre intake, or those seeking weight management support.',
  evidence = 'Evidence is strong across multiple uses: Mofrad et al. (2017), Critical Reviews in Food Science and Nutrition, found in 22 trials that psyllium 7-15 g/day for about 3-5 months produced small additional weight and waist reductions, ranked 15th of 22 with benefit mainly alongside calorie restriction; Gibb et al. (2015), American Journal of Clinical Nutrition, found across 35 randomized studies that usually 10-15 g/day before meals significantly lowered fasting glucose and HbA1c, ranked 2nd of 27 for blood sugar control; Jovanovski et al. (2018), American Journal of Clinical Nutrition, found in 28 studies with 1,924 participants that about 10.2 g/day significantly lowered LDL, non-HDL, and total cholesterol, ranked 2nd of 26; Schoot et al. (2022), American Journal of Clinical Nutrition, found in 16 constipation studies that fibre supplementation, especially psyllium above 10 g/day for at least 4 weeks, improved complete spontaneous bowel movements and stool consistency, ranked 2nd of 13, though effects were modest and study durations were limited.',
  evidence_score = 88,
  how_to_use = 'Typical dose is 3.5-10.5 g daily mixed with at least 250 mL water. Start low and increase gradually. Bowel effects may occur within 1-2 days, while metabolic effects usually take weeks.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 3.5-10.5 g daily, mixed with at least 250 mL water.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 10.5,
    'per_intake_min_value', 3.5,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Psyllium Husk'
  and status = 'approved';

update public.supplements
set
  description = 'A natural polyphenol related to resveratrol that is found in blueberries and grapes and is used for antioxidant and metabolic support.',
  what_is_it = 'Pterostilbene is a natural polyphenol (stilbene) found in foods such as blueberries and grapes. It is structurally similar to resveratrol but has improved bioavailability and cellular uptake due to its methylated structure.',
  why_use_it = 'Used to support cardiovascular health, blood sugar control, cognitive function, and healthy ageing. It may help reduce oxidative stress and inflammation, with potential benefits for blood pressure and overall metabolic health.',
  how_does_it_work = 'Pterostilbene acts as an antioxidant, scavenging free radicals and upregulating endogenous antioxidant enzymes. It activates pathways such as sirtuins and AMPK, which are involved in energy metabolism, cellular repair, and autophagy. It may also improve endothelial and mitochondrial function.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal upset or headache may occur. Long-term safety data are limited, and safety in pregnancy is not established.',
  risks_and_interactions = 'May interact with anticoagulants or antiplatelet medications due to vascular effects. Potential interaction with CYP3A4-metabolised drugs. Use caution in hormone-sensitive conditions.',
  who_might_benefit = 'Individuals with cardiovascular risk factors, metabolic concerns such as prediabetes, or those seeking support for cognitive health and healthy ageing.',
  evidence = 'Beghelli et al. (2022), Oxidative Medicine and Cellular Longevity, found increased mean lifespan and oxidative stress resistance in fruit flies, but this was animal research only and ranked 15th of 15 for anti-ageing supplements. Paul et al. (2009), Cancer Prevention Research, showed dose-dependent inhibition of NF-kB, iNOS, COX-2, and pro-inflammatory cytokine expression in cultured human colon cancer cells, but this was laboratory research only and ranked 35th of 38 for anti-inflammatory supplements. Riche et al. (2014), Evidence-Based Complementary and Alternative Medicine, reported that 125 mg twice daily for 6-8 weeks lowered blood pressure in 80 adults with high cholesterol, but the trial was short and in a limited population, and it ranked 18th of 20 for blood pressure control supplements.',
  evidence_score = 33,
  how_to_use = 'Typical dose: 50-250 mg daily, commonly 100-150 mg. Best taken with meals to enhance absorption. Consistent use is required for metabolic benefits.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 50-250 mg daily (commonly 100-150 mg).',
    'parser_method', 'manual',
    'per_intake_max_value', 250,
    'per_intake_min_value', 50,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Pterostilbene'
  and status = 'approved';

update public.supplements
set
  description = 'A seed oil from Cucurbita pepo that is used mainly for hair, prostate, urinary, and antioxidant support.',
  what_is_it = 'Pumpkin seed oil is extracted from the seeds of Cucurbita pepo. It is rich in essential fatty acids, phytosterols, and carotenoids, giving it a deep green colour and nutty flavour.',
  why_use_it = 'Used to support hair growth, especially androgenetic alopecia, prostate and urinary health in benign prostatic hyperplasia, and cardiovascular health. It also provides antioxidant and anti-inflammatory benefits.',
  how_does_it_work = 'Its phytosterols may inhibit 5-alpha reductase, reducing the conversion of testosterone to DHT, which is linked to hair loss and prostate enlargement. Its fatty acids and antioxidants may also support circulation, reduce inflammation, and promote endothelial and scalp health.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal upset or nausea may occur. Rare allergic reactions can occur in individuals sensitive to seeds.',
  risks_and_interactions = 'May have mild blood-thinning effects, so caution is advised with anticoagulants or antiplatelet medications. Limited safety data are available in pregnancy and breastfeeding.',
  who_might_benefit = 'Men with mild-to-moderate hair loss or urinary symptoms related to BPH, and individuals seeking cardiovascular or antioxidant support.',
  evidence = 'Cho et al. (2014), Evidence-Based Complementary and Alternative Medicine, randomized double-blind placebo-controlled trial in 76 men with mild-to-moderate androgenetic alopecia found 400 mg/day for 24 weeks increased mean hair count by about 40% versus 10% with placebo; ranked 6th of 11 for hair health, with limited sample size. Zerafatjou et al. (2021), BMC Urology, single-blind randomized clinical trial in 73 men aged 50 and over with BPH found 360 mg twice daily for 3 months improved urinary symptom and quality-of-life scores with no notable side effects, though tamsulosin performed better for symptom and flow outcomes; ranked 4th of 7 for urinary health, with limited blinding and duration.',
  evidence_score = 37,
  how_to_use = 'For hair loss, around 400 mg daily. General use is 400 mg to 1-3 g daily with meals. Use consistently for several months, around 24 weeks for hair outcomes.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'For hair loss: Around 400 mg daily. General use: 400 mg to 1-3 g daily with meals. Note: Use consistently for several months (around 24 weeks for hair outcomes).',
    'parser_method', 'direct_text_parse',
    'per_intake_max_value', 400,
    'per_intake_min_value', 400,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Pumpkin Seed Oil'
  and status = 'approved';

update public.supplements
set
  description = 'A standardized French maritime pine bark extract used for vascular, antioxidant, skin, and cognitive support.',
  what_is_it = 'Pycnogenol is a standardized extract from French maritime pine bark (Pinus pinaster), rich in proanthocyanidins, flavonoids, and phenolic acids. It is typically standardized to 65-95% proanthocyanidins and is widely studied for vascular and antioxidant effects.',
  why_use_it = 'It is used to support cardiovascular and metabolic health, including mild reductions in blood pressure and blood sugar. It may also help reduce leg swelling, support cognitive function, improve skin elasticity and hydration, and assist with erectile dysfunction.',
  how_does_it_work = 'It acts as a potent antioxidant, scavenging free radicals and reducing inflammation. It improves nitric oxide availability, promoting vasodilation and better blood flow. It also supports collagen structure, microcirculation, and may influence platelet activity.',
  side_effects = 'Generally well tolerated at typical doses. Mild gastrointestinal upset, headache, or dizziness may occur. Rare allergic reactions are possible in people sensitive to pine.',
  risks_and_interactions = 'May enhance the effects of anticoagulant or antiplatelet medications. Use caution with blood pressure-lowering or glucose-lowering drugs. Safety data are limited in pregnancy and breastfeeding.',
  who_might_benefit = 'People with cardiovascular risk factors, poor circulation, erectile dysfunction, cognitive concerns, or those seeking skin and recovery support.',
  evidence = 'Fogacci et al. (2020), Angiology, a PRISMA-compliant systematic review and meta-analysis of 12 double-blind trials in 922 adults, found Pycnogenol 150-200 mg/day for 4-24 weeks produced small blood pressure reductions, with larger effects in hypertensive patients, ranked 11th of 20 for blood pressure control but limited by modest effect size. Weichmann et al. (2024), Nutrition and Metabolism, pooled multiple trials in about 178 type 2 diabetes patients and found usual doses of 100-200 mg/day for about 3 months lowered fasting glucose and HbA1c versus placebo, ranked 16th of 27 for blood sugar control with relatively small pooled samples. Luzzi et al. (2011), Panminerva Medica, reported in 53 healthy university students that 100 mg/day for 8 weeks improved attention, memory, mood, and exam performance with no notable side effects, ranked 5th of 24 for cognitive support but in a small single study. Simpson et al. (2019), Frontiers in Pharmacology, found small but significant improvements in working and episodic memory and reduced oxidative stress markers in healthy students and older adults, ranked 4th of 20 for memory support, though effects on concentration and reaction speed were inconsistent. Gulati et al. (2013), Phytotherapy Research, reviewed multiple trials and concluded oral Pycnogenol consistently reduced leg swelling, heaviness, and edema and may lower flight-related DVT risk, ranked 3rd of 7 for swelling support but based largely on review-level evidence. Ota et al. (2021), Clinical, Cosmetic and Investigational Dermatology, showed in a 12-week double-blind trial of 76 participants that 100 mg/day improved skin moisture, elasticity, firmness, and barrier function, ranked 6th of 20 for skin health with moderate trial size. Nikpayam et al. (2018), Clinical Nutrition Research, pooled five randomized trials and found Pycnogenol lowered CRP, supporting an anti-inflammatory effect, ranked 15th of 38 for anti-inflammatory support but with limited trial numbers. Jessberger et al. (2017), BMC Complementary and Alternative Medicine, found 200 mg/day for 3 weeks downregulated inflammatory and catabolic markers in 33 severe osteoarthritis patients, ranked 11th of 15 for joint health, but the study was small and short.',
  evidence_score = 78,
  how_to_use = 'Typical dose is 50-200 mg daily with meals. For erectile dysfunction, 80-120 mg daily is often used, sometimes combined with L-arginine. Use consistently for 2-3 months.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 50-200 mg daily with meals. For erectile dysfunction: 80-120 mg daily, often combined with L-arginine.',
    'parser_method', 'rule-based',
    'per_intake_max_value', 200,
    'per_intake_min_value', 50,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Pycnogenol'
  and status = 'approved';

update public.supplements
set
  description = 'PQQ is a redox-active compound that may support energy, cognition, and mitochondrial function.',
  what_is_it = 'PQQ (pyrroloquinoline quinone) is a small redox-active compound found in trace amounts in foods such as kiwifruit, papaya, and breast milk. It acts as a cofactor in cellular energy and antioxidant processes and is one of the few compounds known to stimulate mitochondrial biogenesis.',
  why_use_it = 'PQQ is used to support energy levels, reduce fatigue, and improve overall vitality. It may also support mood, sleep quality, and cognitive function, particularly in people with low energy or age-related decline.',
  how_does_it_work = 'PQQ acts as an antioxidant by repeatedly neutralising reactive oxygen species. It also supports mitochondrial function by stimulating mitochondrial biogenesis through PGC-1α activation, which may enhance ATP production and cellular energy metabolism.',
  side_effects = 'Generally well tolerated at typical doses. Mild gastrointestinal upset or headache may occur. Long-term safety data are still developing.',
  risks_and_interactions = 'Clinical interaction data are limited. There may be theoretical interactions with medications affecting mitochondrial or oxidative pathways. Use caution during pregnancy and breastfeeding.',
  who_might_benefit = 'People experiencing fatigue, low energy, or cognitive concerns, as well as those seeking support for metabolic health or endurance.',
  evidence = 'Evidence is mixed but promising: Nakano et al. (2012, Functional Foods in Health and Disease) reported improved vigour, fatigue, tension, depression, anger, confusion, and sleep in small open-label studies using 20 mg/day for 8 weeks, while Harris et al. (2013, Journal of Nutritional Biochemistry) found short-term reductions in CRP and IL-6 with 0.3 mg/kg/day for 3 days. More recent randomized trials were stronger for function, with Shiojima et al. (2024, Journal of Functional Foods) showing improved strength and walking performance with 21.5 mg/day for 12 weeks and Tamakoshi et al. (2023, Food & Function) showing age-specific cognitive benefits with 20 mg/day for 12 weeks, but Hwang et al. (2020, Journal of the American College of Nutrition) found no aerobic performance benefit during training. Overall rank information ranged from 6th to 28th across categories, and limitations include small samples, short durations, and some open-label designs.',
  evidence_score = 65,
  how_to_use = 'Typical dose is 10-20 mg daily, often taken with meals. It is commonly combined with CoQ10 for mitochondrial support, and effects may develop over days to weeks with consistent use.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 10-20 mg daily, often taken with meals.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 20,
    'per_intake_min_value', 10,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Pyrroloquinoline Quinone (PQQ)'
  and status = 'approved';

update public.supplements
set
  description = 'A natural flavonoid that may help with allergies, inflammation, blood pressure, and exercise recovery.',
  what_is_it = 'Quercetin is a natural flavonoid found in foods such as apples, onions, and berries. It has antioxidant, anti-inflammatory, and mast cell-stabilising effects, and is often paired with vitamin C or bromelain because its bioavailability is relatively low.',
  why_use_it = 'It is used to support allergy control by stabilising mast cells, reduce inflammation, and support cardiovascular health including mild blood pressure reduction. It is also used for immune support, respiratory health, and exercise recovery.',
  how_does_it_work = 'Quercetin scavenges free radicals and increases endogenous antioxidant systems such as glutathione. It inhibits inflammatory pathways including NF-kB and COX-2, stabilises mast cells to reduce histamine release, and may support nitric oxide production and mitochondrial function.',
  side_effects = 'Generally well tolerated at typical doses. Mild gastrointestinal upset, headache, or tingling sensations may occur, especially at higher doses.',
  risks_and_interactions = 'May increase bleeding risk with anticoagulants such as warfarin. It can affect CYP450 enzymes and may interact with medications such as statins or immunosuppressants. Avoid in pregnancy and breastfeeding.',
  who_might_benefit = 'Individuals with seasonal allergies, chronic inflammation, or mild hypertension, as well as athletes seeking recovery support.',
  evidence = 'Evidence is strongest for anti-inflammatory effects, blood pressure control, exercise recovery, and endurance support. Ou et al. (2020) in International Journal of Food Science and Nutrition reviewed 6 trials and found quercetin lowered CRP and reduced IL-6, especially in women and at 500 mg or more daily, but the review was limited by a small number of trials. Serban et al. (2016) in Journal of the American Heart Association reviewed 7 trials with 587 people and found blood pressure fell by about 3/2.6 mmHg, mainly at doses of 500 mg or more per day. Rojano-Ortega et al. (2023) in Biology of Sport reviewed 11 trials with 249 people taking about 1,000 mg daily for 7-12 weeks and found faster recovery, less soreness, and improved antioxidant defenses after exercise. Kressler et al. (2011) in Medicine and Science in Sports and Exercise reviewed 11 trials with 254 people and found about a 2% improvement in VO2max and endurance, with greater benefit in untrained people and no clear dose-duration relationship.',
  evidence_score = 70,
  how_to_use = 'Typical dose is 250-1,000 mg daily, split if above 500 mg. Take with meals or alongside vitamin C or bromelain, and use consistently for several weeks for full effect.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 250-1,000 mg daily, split if above 500 mg.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 500,
    'per_intake_min_value', 250,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Quercetin'
  and status = 'approved';

update public.supplements
set
  description = 'A raspberry-derived aromatic compound sold as a weight-loss supplement, though human evidence for benefit is lacking.',
  what_is_it = 'Raspberry ketones are aromatic compounds found naturally in red raspberries and in smaller amounts in other berries. Because natural levels are very low, most supplements use synthetic versions.',
  why_use_it = 'Marketed for weight loss, fat metabolism, and appetite control, but the claims are based mainly on laboratory and animal studies rather than reliable human evidence.',
  how_does_it_work = 'In theory, raspberry ketones may increase fat breakdown and influence adiponectin, a hormone involved in metabolism, but these effects have mainly been seen in cells or animal models and have not been confirmed in humans.',
  side_effects = 'May cause stimulant-like effects such as jitteriness, palpitations, anxiety, or increased heart rate. Safety at typical supplement doses is not well established.',
  risks_and_interactions = 'Potential cardiovascular risks include elevated blood pressure, arrhythmias, and rare reports of coronary vasospasm. Avoid use in people with heart disease, during pregnancy or breastfeeding, and in children. May interact with stimulants such as caffeine or synephrine.',
  who_might_benefit = 'No clearly defined group has proven benefit. There is no strong human evidence supporting effectiveness, and risks may outweigh potential benefits.',
  evidence = 'Evidence is weak and largely preclinical. Fouad et al. (2019) in Biomedicine & Pharmacotherapy reported that raspberry ketone pretreatment in a rat CCl4 liver injury model reduced pro-inflammatory cytokines and oxidative stress markers, but this was animal research only and ranked 38th of 38 for anti-inflammatory supplements. Arent et al. (2018) in Nutrients found that 45 obese women in an 8-week supervised diet and exercise program lost more weight and body fat when taking a multi-ingredient supplement containing raspberry ketone, but the specific contribution of raspberry ketone was unclear and the study ranked 22nd of 22 for weight management supplements.',
  evidence_score = 4,
  how_to_use = 'Commercial doses range widely from 100-1,400 mg daily, but use is not recommended. Whole raspberries are a safer dietary alternative with no safety concerns.',
  recommended_dose_status = 'ambiguous',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('commercial dose range', 'use not recommended'),
    'confidence', 0.62,
    'source_text', 'Commercial doses: Range widely (100-1,400 mg daily), but use is not recommended.',
    'parser_method', 'range_extraction',
    'per_intake_max_value', 1400,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Raspberry Ketones'
  and status = 'approved';

update public.supplements
set
  description = 'A polyphenol supplement from Japanese knotweed that is used for antioxidant, anti-inflammatory, cardiovascular, and blood sugar support.',
  what_is_it = 'Resveratrol is a polyphenol found in foods such as grapes, berries, and Japanese knotweed (Polygonum cuspidatum). Supplements typically contain concentrated trans-resveratrol, although overall bioavailability is relatively low. It is known for antioxidant and anti-inflammatory properties and has attracted interest as a potential anti-ageing compound.',
  why_use_it = 'It is used to support cardiovascular health, improve endothelial function, and assist with blood sugar regulation. It is also explored for effects on cellular ageing, inflammation, and cognitive health.',
  how_does_it_work = 'Resveratrol activates cellular pathways such as SIRT1 and AMPK, which are involved in energy metabolism and cellular repair. It also scavenges free radicals, reduces inflammatory signalling such as NF-kB, and improves nitric oxide availability, supporting vascular function.',
  side_effects = 'Generally well tolerated at typical doses. Higher doses may cause gastrointestinal upset such as nausea or diarrhoea. Caution is advised with very high intake.',
  risks_and_interactions = 'May increase bleeding risk when combined with anticoagulants. Can enhance glucose-lowering medications, requiring monitoring. May interact with hormone-sensitive pathways and CYP450 enzymes. Avoid in pregnancy.',
  who_might_benefit = 'Individuals with cardiovascular risk factors, metabolic syndrome, type 2 diabetes, or those seeking anti-inflammatory and healthy ageing support.',
  evidence = 'Koushki et al. (2018) in Clinical Therapeutics reviewed 17 randomized controlled trials with 736 people and found resveratrol lowered TNF-alpha and hs-CRP versus placebo, supporting an anti-inflammatory effect, ranked 10th of 38 for anti-inflammatory supplements, though the evidence is limited by trial heterogeneity. Rao et al. (2025) in Frontiers in Aging reported that 122 women aged 40+ using 150 mg/day oral trans-resveratrol plus topical cream for 8 weeks had reduced wrinkle scores versus placebo, ranked 6th of 15 for anti-ageing supplements, but the study was short and combined oral with topical treatment. Movahed et al. (2013) in Evidence-Based Complementary and Alternative Medicine found that 66 people with type 2 diabetes taking 1 g/day for 45 days had lower fasting glucose, HbA1c, and insulin versus baseline and placebo, with improved HDL and systolic blood pressure and no hepatic or renal toxicity, ranked 21st of 27 for blood sugar control supplements, but the trial was small and short-term.',
  evidence_score = 52,
  how_to_use = 'Typical dose is 100-500 mg daily of trans-resveratrol, taken with meals. Use consistently for 8-12 weeks to assess effects.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('trans-resveratrol', 'taken with meals'),
    'confidence', 0.95,
    'source_text', 'Typical dose: 100-500 mg daily (trans-resveratrol), taken with meals.',
    'parser_method', 'manual',
    'per_intake_max_value', 500,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Resveratrol (Japanese Knotweed)'
  and status = 'approved';

update public.supplements
set
  description = 'Rhodiola rosea is an adaptogenic herb used to help the body cope with stress, fatigue, and low mood.',
  what_is_it = 'Rhodiola rosea is an adaptogenic herb found in cold, mountainous regions of Europe and Asia. The root contains active compounds including rosavins and salidroside, which are thought to increase resistance to physical and mental stress.',
  why_use_it = 'Rhodiola is used to reduce stress, burnout, and fatigue. It may support mental performance, including focus and cognitive function, and can have mild mood-enhancing effects. It is also used to support physical endurance and recovery during periods of increased demand.',
  how_does_it_work = 'Rhodiola is believed to modulate the hypothalamic-pituitary-adrenal (HPA) axis, helping regulate cortisol levels. It may also influence neurotransmitters such as serotonin and dopamine, support cellular energy production, and reduce oxidative stress and inflammation.',
  side_effects = 'Generally well tolerated at typical doses. Some individuals may experience dizziness, dry mouth, or mild jitteriness. Insomnia can occur if taken later in the day.',
  risks_and_interactions = 'Caution is advised when combined with antidepressants, including SSRIs and MAOIs, due to a potential risk of serotonin excess. Use carefully in bipolar disorder due to possible mania risk. It may also lower blood sugar and blood pressure.',
  who_might_benefit = 'Individuals with stress, burnout, or fatigue, including professionals and students. It may also benefit those seeking support for endurance, recovery, or mild low mood.',
  evidence = 'Evidence is mixed but generally supportive for stress, fatigue, mood, endurance, and attention. Olsson et al. (2009), Planta Medica, found 576 mg/day SHR-5 for 28 days reduced stress-related fatigue, improved attention and mental performance, and lowered cortisol versus placebo, with benefits within the first week; ranked 5th of 15 for stress relief. Wang et al. (2025), Frontiers in Nutrition, reviewed 26 trials in 668 healthy participants and found improvements in VO2max, time to exhaustion, time-trial performance, lactate, muscle damage, and antioxidants, with doses above 600 mg/day performing best; ranked 5th of 26 for endurance. Ishaque et al. (2012), BMC Complementary and Alternative Medicine, reviewed 11 trials and found inconsistent effects on fatigue and mental performance, with many older studies limited by weak methods; ranked 8th of 21 for energy. Mao et al. (2015), Phytomedicine, found 340-680 mg daily for 12 weeks reduced depression scores more than placebo and caused fewer side effects than sertraline, though sertraline improved symptoms slightly more; ranked 6th of 18 for mood. Koozehchian et al. (2025), Nutrients, found dose-related improvements in attention and speed in 27 resistance-trained athletes, ranked 15th of 24 for cognitive support. Koop et al. (2020), Phytotherapy Research, found faster reaction times and EEG changes in a 12-week open-label study of 50 adults, ranked 5th of 9 for concentration. Limitations include mixed trial quality, small samples, and some open-label or short-duration studies.',
  evidence_score = 62,
  how_to_use = 'Typical dose is 200-600 mg daily of a standardized extract, around 3% rosavins. Take in the morning or early afternoon. Use for 6-12 weeks to assess effects.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardized_extract', 'per_day'),
    'confidence', 0.95,
    'source_text', 'Typical dose: 200-600 mg daily (standardised extract, around 3% rosavins).',
    'parser_method', 'rule_based',
    'per_intake_max_value', 600,
    'per_intake_min_value', 200,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Rhodiola Rosea'
  and status = 'approved';

update public.supplements
set
  description = 'A saffron extract supplement may help with mood, anxiety, sexual dysfunction, PMS, and early macular degeneration.',
  what_is_it = 'Saffron is a spice derived from the stigmas of Crocus sativus. It contains active compounds including crocin and safranal. Standardised extracts are used for potential benefits in mood, anxiety, and eye health.',
  why_use_it = 'Saffron has evidence for mild-to-moderate depression and anxiety, with some studies suggesting effects comparable to SSRIs but with fewer side effects. It may also reduce symptoms of PMS and PMDD, improve SSRI-induced sexual dysfunction, and support early age-related macular degeneration.',
  how_does_it_work = 'Saffron has antioxidant and anti-inflammatory properties, contributing to neuroprotection. It modulates neurotransmitters including serotonin, dopamine, and glutamate, which may support mood regulation. It may also enhance retinal oxygenation and function.',
  side_effects = 'Generally well tolerated at standard doses. Mild drowsiness or gastrointestinal upset may occur. High doses are not recommended, particularly in pregnancy.',
  risks_and_interactions = 'Theoretical risk of serotonin excess when combined with SSRIs. Use with caution in bipolar disorder due to possible mania risk. May lower blood sugar and blood pressure. Avoid high doses in pregnancy.',
  who_might_benefit = 'Individuals with mild-to-moderate depression or anxiety, those experiencing SSRI-related sexual side effects, and those with PMS, PMDD, or early macular degeneration.',
  evidence = 'Hausenblas et al. (2015), Journal of Integrative Medicine, found in a meta-analysis of five short trials (177 adults) that 30 mg/day saffron for 6-8 weeks reduced depressive symptoms versus placebo and performed comparably to fluoxetine and imipramine; it was ranked 2nd out of 18 for mood support, with the main limitation being small, short trials. Pouchieu et al. (2023), Nutrients, reported that a single 30 mg dose of saffron extract reduced perceived stress and anxiety in 24 healthy men during an acute stress test and delayed the saliva stress-hormone peak; it ranked 10th out of 15 for stress relief, with a small healthy sample. Najafabadi et al. (2022), Journal of Herbal Medicine, found that 30 mg/day saffron for 6 weeks improved erectile function in 62 men with mild erectile dysfunction and had a favourable safety profile; it ranked 7th out of 10 for male sexual arousal, with a modest sample size. Ranjbar et al. (2019), Avicenna Journal of Phytomedicine, found across several trials that about 30 mg/day saffron for 4-6 weeks improved female sexual function, including arousal, lubrication, and pain; it ranked 2nd out of 7 for female sexual arousal, with trial quality and size limitations.',
  evidence_score = 79,
  how_to_use = 'Depression or anxiety: 30 mg daily, usually 15 mg twice daily, for 6-12 weeks. PMS: 30 mg daily during the luteal phase. Eye health: 20-30 mg daily.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Depression / anxiety: 30 mg daily (15 mg twice daily) for 6-12 weeks. PMS: 30 mg daily during the luteal phase. Eye health: 20-30 mg daily.',
    'parser_method', 'manual',
    'per_intake_max_value', 30,
    'per_intake_min_value', 15,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Saffron Extract'
  and status = 'approved';

update public.supplements
set
  description = 'SAMe is a naturally occurring methyl donor supplement studied mainly for mood and joint support.',
  what_is_it = 'S-adenosylmethionine (SAMe) is a naturally occurring amino acid derivative that acts as a methyl donor in key biochemical processes. It supports the synthesis of neurotransmitters and phospholipids and is available as an oral or injectable supplement.',
  why_use_it = 'SAMe has evidence for use in depression and osteoarthritis. It may help improve mood and support joint pain and function. It has also been studied in liver conditions such as cholestasis, where it may improve biochemical markers.',
  how_does_it_work = 'SAMe facilitates methylation reactions required for the synthesis of serotonin, dopamine, and norepinephrine, supporting mood regulation. It also contributes to the production of cartilage proteoglycans, relevant for joint health. In the liver, it supports the transsulfuration pathway and promotes glutathione production.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal symptoms, particularly nausea, are most common. Onset of benefit may take several weeks and is typically slower than pharmacological treatments.',
  risks_and_interactions = 'Risk of serotonin excess when combined with SSRIs - monitoring is advised. Avoid in bipolar disorder due to mania risk and with MAOIs. No major CYP450 interactions are reported.',
  who_might_benefit = 'Individuals with mild-to-moderate depression seeking an alternative or adjunct to antidepressants, and those with osteoarthritis.',
  evidence = 'Rutjes et al. 2009, Cochrane Review/Osteoarthritis and Cartilage, reviewed four trials in 656 people with hip or knee osteoarthritis and found SAMe gave only a tiny, not clearly meaningful pain benefit over placebo, no real improvement in function, and similar side-effect rates to placebo; ranked 13th out of 15 for joint health supplements. Pfalzer et al. 2014, Physiological Genomics, found in human immune-like cells that SAMe reduced TNF-alpha gene activity by about 45% and increased IL-10 by about 77% through DNA methylation changes, but this was laboratory research only and ranked 34th out of 38 for anti-inflammatory supplements.',
  evidence_score = 29,
  how_to_use = 'Typical dose: 400-1,600 mg daily. Take on an empty stomach. Start low and increase gradually to minimise gastrointestinal effects.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 400-1,600 mg daily.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 1600,
    'per_intake_min_value', 400,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'SAMe (S-Adenosylmethionine)'
  and status = 'approved';

update public.supplements
set
  description = 'A berry extract from a small palm used mainly for prostate symptoms and hair loss.',
  what_is_it = 'Saw palmetto is a small palm (Serenoa repens) native to the southeastern United States. Extracts from its berries, standardized to lipidosterolic compounds (fatty acids and sterols), are used for benign prostatic hyperplasia and hair loss.',
  why_use_it = 'It is marketed for benign prostatic hyperplasia and lower urinary tract symptoms, as well as androgenetic alopecia. Evidence for BPH is mixed and often comparable to placebo, while there is some evidence suggesting modest benefit in hair loss.',
  how_does_it_work = 'It is thought to inhibit 5-alpha reductase (types I and II), reducing dihydrotestosterone (DHT) levels. It also has anti-inflammatory effects and may influence prostate and bladder function.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal upset, headache, and fatigue are the most common side effects. Rare serious events including bleeding complications and liver toxicity have been reported, though causality is unclear.',
  risks_and_interactions = 'May increase bleeding risk with anticoagulants such as warfarin or rivaroxaban, so monitoring is advised. It may reduce oral contraceptive effectiveness. Contraindicated in pregnancy and breastfeeding. Avoid in children.',
  who_might_benefit = 'Men with mild-to-moderate androgenetic alopecia seeking alternatives to pharmacological treatments, and men with mild BPH who prefer non-prescription options, recognizing limited efficacy.',
  evidence = 'Hair health evidence is stronger than urinary evidence: Sudeep et al. (2023), Clinical, Cosmetic and Investigational Dermatology, reported that 16 weeks of oral and topical standardized saw palmetto oil in 80 adults with mild to moderate pattern hair loss reduced shedding and increased hair density and thickness versus placebo without serious side effects, earning a gold rating and ranking 1st of 11 for hair health, though the study was small. Urinary evidence is weaker: Barry et al. (2011), JAMA, found in 369 men aged 45+ with moderate BPH symptoms that escalating doses of saw palmetto extract were no better than placebo for symptom scores, nocturia, urinary flow, residual urine, PSA, or quality of life, earning a bronze rating and ranking 6th of 7 for urinary health.',
  evidence_score = 76,
  how_to_use = 'BPH: 320 mg daily, usually 160 mg twice daily with meals. Hair loss: 100-320 mg daily for at least 3-6 months.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'BPH: 320 mg daily (160 mg twice daily with meals). Hair loss: 100-320 mg daily for at least 3-6 months.',
    'parser_method', 'manual',
    'per_intake_max_value', 160,
    'per_intake_min_value', 50,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Saw Palmetto'
  and status = 'approved';

update public.supplements
set
  description = 'A red seaweed supplement used mainly for fiber, mineral, gut, and skin support.',
  what_is_it = 'Sea moss (Irish moss, Chondrus crispus) is a red seaweed rich in soluble fibre, minerals, especially iodine, and sulphated polysaccharides, sold as dried seaweed, powder, or gel.',
  why_use_it = 'It is promoted for gut and skin health, with additional claims for thyroid and immune support, though human evidence is very limited.',
  how_does_it_work = 'Its soluble fibres resist digestion and are fermented by gut bacteria into short-chain fatty acids that support the gut barrier and microbiome. It also contains antioxidant and anti-inflammatory compounds, and topical use may help skin hydration and barrier function.',
  side_effects = 'High fibre content may cause gas, bloating, or looser stools, especially if introduced quickly.',
  risks_and_interactions = 'Some products may contain high iodine levels or contaminants such as heavy metals. Excess iodine can affect thyroid function. High fibre intake may reduce absorption of some medications. People with thyroid disease or taking thyroid medication should seek medical advice.',
  who_might_benefit = 'People with low iodine intake who want a food-based source of fibre and minerals, or those seeking adjunct support for gut and skin health.',
  evidence = 'Liu et al. (2015), BMC Complementary Medicine and Therapies, found that rats fed 2.5% Chondrus crispus for 21 days had more beneficial gut bacteria, fewer harmful bacteria, 17% higher stool water, and increased immune antibodies, but this was animal research only and ranked 13th of 13 for digestive health. Roach et al. (2023), Marine Drugs, reported that 2 g daily of a red-seaweed extract in a 6-week crossover trial of 44 adults with inflammatory skin conditions reduced redness, itching, and scaling and improved some inflammation markers versus placebo, with good tolerance, but the extract was not specifically sea moss and the study ranked 20th of 20 for skin health.',
  evidence_score = 11,
  how_to_use = 'Typical dose is a teaspoon of gel or powder once or twice daily. Add it to foods such as smoothies or porridge and start low, then increase gradually.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'teaspoon',
    'flags', jsonb_build_array('typical dose', 'food form'),
    'confidence', 0.74,
    'source_text', 'A teaspoon of gel or powder once or twice daily.',
    'parser_method', 'manual',
    'per_intake_max_value', 1,
    'per_intake_min_value', 1,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Sea Moss'
  and status = 'approved';

update public.supplements
set
  description = 'An essential trace mineral that supports antioxidant enzymes, thyroid function, and fertility, but can be toxic at high doses.',
  what_is_it = 'Selenium is an essential trace mineral required for selenoproteins, including glutathione peroxidase and thyroid peroxidase. It is found in Brazil nuts, seafood, and grains. The recommended daily intake is 55 µg, with an upper limit of 400 µg per day.',
  why_use_it = 'Selenium is mainly used as a targeted antioxidant and fertility cofactor. It may support fertility in individuals with low levels and is sometimes used short term after head and neck surgery to reduce post-operative swelling.',
  how_does_it_work = 'Selenium is incorporated into selenoproteins that support antioxidant defence by neutralising reactive oxygen species. It also plays a role in thyroid hormone synthesis and immune cell function.',
  side_effects = 'Generally well tolerated at recommended doses. Toxicity (selenosis) can occur with excessive intake and may cause nausea, hair and nail changes, and neuropathy.',
  risks_and_interactions = 'High-dose supplementation has been linked to an increased risk of high-grade prostate cancer in selenium-replete men. There is also a possible association with increased diabetes risk.',
  who_might_benefit = 'Individuals with deficiency and some patients with Hashimoto''s thyroiditis, particularly those with elevated thyroid antibodies.',
  evidence = 'Filippini et al. (2023), American Journal of Clinical Nutrition, reviewed nine trials in healthy adults over 8-48 weeks and found selenium did not clearly change antibody levels or total white blood cells but slightly affected some T-cell and natural killer cell measures, mainly in people starting with low selenium; ranked 15th of 19 for immune health and limited by modest effects and heterogeneous trials. Lima et al. (2022), Revista Brasileira de Ginecologia e Obstetrícia, reviewed 19 human studies and found higher selenium levels were associated with better egg-follicle antioxidant status, lower thyroid antibodies, and better fertility treatment outcomes, while low selenium was linked to repeat miscarriage; ranked 7th of 9 for female fertility and limited by lack of strong trials. Safarinejad (2009), Journal of Urology, studied 468 infertile men and found 26 weeks of 200 µg/day selenium, 600 mg/day NAC, or both improved sperm concentration, motility, morphology, and testosterone versus placebo, with the combination showing the largest gains; ranked 4th of 6 for male fertility and limited by the study population and treatment design.',
  evidence_score = 21,
  how_to_use = 'Hashimoto''s: 200 µg daily for 3-6 months under medical guidance. Dietary: 1-2 Brazil nuts daily may be sufficient for most people.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'µg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Hashimoto''s: 200 µg daily for 3-6 months under medical guidance.',
    'parser_method', 'explicit dose extraction',
    'per_intake_max_value', 200,
    'per_intake_min_value', 200,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Selenium'
  and status = 'approved';

update public.supplements
set
  description = 'A mineral-rich Ayurvedic resin-like substance that may support energy, hormones, and exercise performance.',
  what_is_it = 'Shilajit is a mineral-rich, tar-like exudate found in high-altitude rocks, formed from decomposed plant material over time. It has a long history of use in Ayurvedic medicine. Raw forms may contain contaminants, so purification and laboratory testing are essential.',
  why_use_it = 'Early human studies suggest shilajit may support mitochondrial function, reduce fatigue, and improve vitality. It has been associated with increases in testosterone and DHEAS, improved female sexual function, and enhanced exercise performance including strength, endurance, and recovery.',
  how_does_it_work = 'Shilajit is rich in fulvic acid, which may enhance mitochondrial ATP production and reduce exercise-induced fatigue. It also has antioxidant and anti-inflammatory effects. It may influence the hypothalamic-pituitary-gonadal axis, supporting hormone levels and contributing to muscle and connective tissue adaptation.',
  side_effects = 'Short-term use at 250-500 mg daily appears generally well tolerated, with occasional mild gastrointestinal upset or dizziness.',
  risks_and_interactions = 'Only purified, lab-tested products should be used due to the risk of heavy metal contamination. Avoid in autoimmune disease, haemochromatosis, and hormone-sensitive cancers. Use cautiously with antidiabetic and antihypertensive medications. Avoid in pregnancy and breastfeeding.',
  who_might_benefit = 'Middle-aged men seeking testosterone and vitality support, active individuals aiming to improve fatigue resistance and performance, and selected women with low sexual desire related to fatigue, stress, or ageing.',
  evidence = 'Evidence includes a 2022 Journal of Medicinal Food trial by Pingali et al. in 110 postmenopausal women with osteopenia showing 250 or 500 mg/day for 48 weeks improved bone mineral density and reduced oxidative stress and inflammatory markers, ranked 11th of 15 for anti-ageing; a 2016 Andrologia double-blind trial by Pandit et al. in 75 healthy men aged 45-55 showing 250 mg twice daily for 90 days increased total and free testosterone and DHEAS without changing LH or FSH, ranked 4th of 9 for testosterone; a 2024 International Journal of Trend in Scientific Research and Development study by Mehra et al. in 60 healthy adults showing improved 6-minute walk distance, oxygen-use measures, and about 22% more squats, ranked 8th of 26 for endurance; a 2023 Traditional Medicine Research triple-blind randomized trial by Mosavi et al. showing improved female sexual function scores for desire, arousal, lubrication, and satisfaction over 60-90 days, ranked 6th of 7 for female sexual arousal; and a 2019 Journal of the International Society of Sports Nutrition study by Keller et al. in 63 active men showing 500 mg/day for 8 weeks reduced fatigue-related strength loss, ranked 14th of 20 for strength, with overall evidence limited by small studies and short durations.',
  evidence_score = 60,
  how_to_use = 'Typical dose is 250-500 mg daily with food using purified, standardized shilajit standardized to about 20% fulvic acid. Cycle use is often suggested, such as 8-12 weeks on followed by 2-4 weeks off.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('with_food', 'standardized_extract', 'cycle_use'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 250-500 mg daily with food (purified, standardised to ~20% fulvic acid). Note: Cycle use - e.g. 8-12 weeks on, 2-4 weeks off.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 500,
    'per_intake_min_value', 250,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Shilajit'
  and status = 'approved';

update public.supplements
set
  description = 'Soy isoflavones are plant compounds from soy that may modestly support bone health and inflammation in low-estrogen states such as menopause.',
  what_is_it = 'Soy isoflavones are phytoestrogens found in soybeans such as tofu, tempeh, and edamame. They have structural similarity to estrogen and bind weakly to estrogen receptors, especially ERβ. They are often described as natural selective estrogen receptor modulators with mild estrogen-like effects in low-estrogen states.',
  why_use_it = 'Evidence supports possible benefits for menopausal bone health and low-grade inflammation. They may help preserve postmenopausal bone density and may lower inflammatory markers such as C-reactive protein in some groups.',
  how_does_it_work = 'Soy isoflavones act as selective estrogen receptor modulators, producing weak estrogen-like effects in low-estrogen states and mild anti-estrogen effects in higher-estrogen states. They may also reduce bone resorption and have antioxidant and anti-inflammatory actions.',
  side_effects = 'Generally well tolerated at doses up to around 120 mg daily. Mild gastrointestinal symptoms may occur. Small increases in TSH have been reported in people with hypothyroidism or low iodine intake.',
  risks_and_interactions = 'Soy can reduce levothyroxine absorption, so it should be taken at least 4 hours apart. Intake from foods appears safe in breast cancer survivors. There is no clear evidence of feminizing effects in men.',
  who_might_benefit = 'Women with menopausal symptoms, people at risk of bone loss, and individuals with low-grade inflammation may benefit. It may also suit people following plant-based diets.',
  evidence = 'Gencturk et al. (2024) in Explore (NY) found no significant improvement in menopausal symptoms or quality of life in peri- and postmenopausal women and ranked soy isoflavones 13th of 13 for female hormone balance, while Ma et al. (2008) in Osteoporosis International found increased spine bone mineral density in 10 trials of 608 menopausal women, especially above 90 mg/day for at least 6 months, ranking 4th of 10 for bone health, and Asbaghi et al. (2023) in Food & Function found no overall CRP reduction but modest subgroup reductions in CRP and TNF-alpha with higher baseline inflammation, longer duration, or higher doses, ranking 19th of 38 for anti-inflammatory supplements; overall evidence is mixed, with the strongest support for bone outcomes and limitations including variable dosing, subgroup effects, and inconsistent symptom benefits.',
  evidence_score = 57,
  how_to_use = 'Typical intake is 40-100 mg daily. For bone health, up to 80-120 mg daily may be used. Alternatively, 1-3 servings of soy foods daily can be consumed.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical intake: 40-100 mg daily. For bone health: Up to 80-120 mg daily.',
    'parser_method', 'direct_range_extraction',
    'per_intake_max_value', 120,
    'per_intake_min_value', 40,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Soy Isoflavones (Genistein and Daidzein)'
  and status = 'approved';

update public.supplements
set
  description = 'A natural polyamine supplement that may support hair health and cellular maintenance by promoting autophagy.',
  what_is_it = 'Spermidine is a natural polyamine found in foods such as wheat germ, aged cheese, soy, and mushrooms. Levels decline with age. It is available as wheat germ extract or synthetic supplements and is known for its ability to activate autophagy, the cellular self-cleaning process.',
  why_use_it = 'Human evidence is strongest for hair health, where spermidine-based supplements may prolong the anagen phase and reduce shedding. Early data also suggest possible roles in cognitive and cardiovascular health.',
  how_does_it_work = 'Spermidine stimulates autophagy through pathways including eIF5A hypusination, helping remove damaged proteins and supporting mitochondrial function. It may also reduce oxidative stress and inflammation and influence cellular survival.',
  side_effects = 'Low-dose supplementation around 1 mg/day appears well tolerated. Mild gastrointestinal symptoms such as diarrhoea may occur.',
  risks_and_interactions = 'Very high intakes should be avoided. No confirmed drug interactions are known, but evidence is limited. Avoid use in pregnancy and breastfeeding. Use caution in significant kidney or liver disease.',
  who_might_benefit = 'People with diffuse hair thinning or telogen effluvium may benefit most. Older adults interested in cellular maintenance or cognitive support may also consider it alongside a spermidine-rich diet.',
  evidence = 'Hair health evidence is strongest: Rinaldi et al. (2017), Dermatology Practical & Conceptual, a randomized double-blind placebo-controlled trial in 100 healthy adults found that a spermidine-based supplement increased advanced growth-phase hair follicles, boosted Ki-67, lowered c-KIT, and reduced shedding at 6 months, ranked 3rd of 11 for hair health, though the study was relatively small. Memory evidence is weaker: Wirth et al. (2018), Cortex, in 30 older adults with memory complaints found slightly better memory and pattern separation after 3 months of spermidine-rich wheat germ, ranked 17th of 20 for memory enhancing supplements, but some results were statistically uncertain. Cognitive support evidence was negative overall: Schwarz et al. (2022), JAMA Network Open, in 100 older adults with subjective cognitive decline found no improvement in main memory or global cognition after 12 months of 0.9 mg/day spermidine-rich wheat germ, ranked 22nd of 24, with only weak subgroup hints. Cardiovascular evidence is indirect: Wang et al. (2025), Journal of the American Heart Association, genetic and metabolomic analyses linked lower spermidine levels with higher coronary heart disease risk and lower levels in patients, ranked 12th of 18, but this does not prove supplementation benefit.',
  evidence_score = 62,
  how_to_use = 'Typical dose is around 1 mg daily for 3 to 12 months.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Around 1 mg daily for 3-12 months.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 1,
    'per_intake_min_value', 1,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Spermidine'
  and status = 'approved';

update public.supplements
set
  description = 'A blue-green microalgae supplement used for its protein, antioxidant, and metabolic health effects.',
  what_is_it = 'Spirulina is a blue-green microalgae (Arthrospira platensis) rich in protein, phycocyanin, carotenoids, minerals, and fatty acids. It is used as a powder or tablet supplement and studied for metabolic and immune effects.',
  why_use_it = 'Human trials suggest spirulina can modestly improve lipid profiles, reduce blood pressure in some groups, and support glycaemic control in metabolic syndrome and type 2 diabetes. It also shows anti-inflammatory and antioxidant effects.',
  how_does_it_work = 'Phycocyanin and related compounds exert antioxidant and anti-inflammatory effects, reducing markers such as IL-6. Spirulina may improve lipid metabolism and insulin sensitivity, enhance nitric oxide-mediated vasodilation, and modulate cytokines.',
  side_effects = 'Generally well tolerated. Mild gastrointestinal symptoms, including nausea or loose stools, may occur. Rare allergic reactions are possible; caution in algae allergy or phenylketonuria.',
  risks_and_interactions = 'Contamination with toxins or heavy metals is possible in poorly regulated products, so third-party testing is important. Use caution in autoimmune disease and with immunomodulatory drugs. Monitor with antihypertensive or glucose-lowering medications.',
  who_might_benefit = 'Individuals with mild dyslipidaemia, metabolic syndrome, type 2 diabetes, or borderline hypertension may benefit as an adjunct to lifestyle measures.',
  evidence = 'Evidence is strongest for cholesterol support: Rahnama et al. (2023), Pharmacology Research, an umbrella meta-analysis of 20 randomised trials in 1,076 people found spirulina lowered total cholesterol, LDL cholesterol, and triglycerides and increased HDL cholesterol, though results varied considerably between studies; it ranked 1st out of 26 for cholesterol support. Additional support comes from Jazinaki et al. (2025), Food Science & Nutrition, a systematic review and meta-analysis of 7 randomised trials in 283 people showing lower CRP and ranking 12th out of 38 for anti-inflammatory supplements; Hatami et al. (2021), Journal of Diabetes and Metabolic Disorders, a meta-analysis of 8 studies in type 2 diabetes showing lower fasting glucose and improved lipids but no significant HbA1c or postprandial glucose change, ranked 17th out of 27 for blood sugar control; Kazemi et al. (2025), European Journal of Nutrition, a GRADE-assessed meta-analysis of randomised trials showing lower systolic and diastolic blood pressure, especially in higher-risk groups and with use over 8 weeks, ranked 7th out of 20 for blood pressure control; Aghasadeghi et al. (2024), Frontiers in Immunology, a randomised controlled trial in 189 hospitalised COVID-19 patients found 15.2 g/day added to standard care lowered inflammatory markers and improved discharge outcomes, ranked 10th out of 19 for immune health; and Johnson et al. (2016), International Journal of Food Science and Nutrition, a double-blind placebo-controlled study in healthy men found 3 g/day for 8 weeks slightly improved fatigue and exercise output, ranked 14th out of 21 for energy enhancing. Overall, the evidence is fairly strong for lipid effects and more mixed or condition-specific for other uses, with variability between studies and some findings based on short-term trials.',
  evidence_score = 83,
  how_to_use = 'Typical dose: 2-8 g daily for 8-16 weeks.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.98,
    'source_text', 'Typical dose: 2-8 g daily for 8-16 weeks.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 8,
    'per_intake_min_value', 2,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Spirulina'
  and status = 'approved';

update public.supplements
set
  description = 'A herbal extract used mainly for mild to moderate low mood and nervous tension.',
  what_is_it = 'St John''s wort is a herbal extract from Hypericum perforatum, traditionally used for low mood and nervous tension. Standardised supplements provide defined amounts of hypericin and/or hyperforin, considered the main active components.',
  why_use_it = 'It may support mood in individuals with mild to moderate depressive symptoms and help with associated sleep and anxiety complaints. Some evidence also suggests anti-inflammatory and antioxidant effects, which may contribute to broader nervous system support.',
  how_does_it_work = 'Hypericum extracts influence neurotransmitters including serotonin, norepinephrine, and dopamine reuptake, as well as GABA and glutamate activity. It also reduces inflammatory signalling and oxidative stress, supporting both mood and cellular function.',
  side_effects = 'Common side effects include mild gastrointestinal upset, dry mouth, dizziness, fatigue, restlessness, and increased sensitivity to sunlight. It may cause serotonin-related effects if combined with other serotonergic agents.',
  risks_and_interactions = 'St John''s wort induces cytochrome P450 enzymes and P-glycoprotein, reducing the effectiveness of many medications including oral contraceptives, anticoagulants, immunosuppressants, and some antidepressants. Medical advice is essential before use.',
  who_might_benefit = 'Adults with mild to moderate low mood who are not taking interacting medications and prefer a herbal approach, ideally with professional guidance.',
  evidence = 'Cui et al. (2016), Neuropsychiatric Disease and Treatment, a meta-analysis of 27 trials in 3,126 adults with mild-to-moderate depression, found St John''s wort worked about as well as SSRIs for response, remission, and symptom scores, with fewer side effects and fewer treatment dropouts; it was ranked 1st out of 18 for mood support, though the comparison evidence still has trial and product variability limitations. Tedeschi et al. (2003), Journal of Pharmacology and Experimental Therapeutics, reported laboratory-only anti-inflammatory effects in human epithelial cell models, lowering nitric oxide, COX-2, and IL-6 via STAT-1alpha and JAK-2 inhibition, but this was ranked 37th out of 38 for anti-inflammatory supplements.',
  evidence_score = 80,
  how_to_use = 'Typical dose: 600-900 mg daily (e.g. 300 mg three times daily) for 6-8 weeks.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.98,
    'source_text', 'Typical dose: 600-900 mg daily (e.g. 300 mg three times daily) for 6-8 weeks.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 300,
    'per_intake_min_value', 300,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 3
  ),
  dose_scoring_profile_json = null
where name = 'St. John''s Wort (Hypericum perforatum)'
  and status = 'approved';

update public.supplements
set
  description = 'Plant sterols are cholesterol-like compounds that can help lower LDL cholesterol when taken with meals as part of a heart-healthy routine.',
  what_is_it = 'Plant sterols (phytosterols) are cholesterol-like compounds found in nuts, seeds, vegetable oils, wholegrains, and fortified foods. They compete with cholesterol for absorption in the gut, reducing how much enters the bloodstream.',
  why_use_it = 'At adequate intakes, plant sterols can lower LDL cholesterol, a key driver of atherosclerosis and cardiovascular risk. They are used alongside diet and lifestyle measures, and sometimes medication, to support healthier cholesterol levels.',
  how_does_it_work = 'Sterols are structurally similar to cholesterol and displace it from micelles in the intestine, reducing absorption and increasing excretion. This leads the liver to remove more LDL cholesterol from the blood, lowering circulating levels with minimal effect on HDL or triglycerides.',
  side_effects = 'Generally well tolerated up to about 3 g daily. Mild gastrointestinal symptoms such as bloating or loose stools may occur. They can slightly reduce carotenoid levels, so a diet rich in fruits and vegetables is recommended.',
  risks_and_interactions = 'Individuals with sitosterolaemia should avoid sterols due to increased accumulation. In the general population, moderate use appears safe, although long-term outcome data are limited.',
  who_might_benefit = 'Adults with elevated LDL cholesterol, including those not at target despite lifestyle changes or medication, and individuals at higher cardiovascular risk.',
  evidence = 'Genser et al. (2012), Atherosclerosis, reviewed 17 long-term studies in 11,182 people with 1,018 heart events and found no clear harmful or protective cardiovascular signal for higher blood plant sterol levels, with limitations including observational uncertainty; Ras et al. (2014), British Journal of Nutrition, analyzed 124 randomized studies in about 10,000 people and found 0.6-3.3 g/day of plant sterols or stanols lowered LDL cholesterol in a dose-dependent way, about 8-9% at 2 g/day and about 12% at 3 g/day, though long-term outcome data remain limited.',
  evidence_score = 70,
  how_to_use = 'Typical dose: 1.5-3 g daily, commonly 2 g, taken with meals. Use consistently alongside a heart-healthy lifestyle.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g/day',
    'flags', jsonb_build_array(),
    'confidence', 0.96,
    'source_text', 'Typical dose: 1.5-3 g daily (commonly 2 g) with meals.',
    'parser_method', 'direct_range_and_common_dose',
    'per_intake_max_value', 3,
    'per_intake_min_value', 1.5,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Sterols'
  and status = 'approved';

update public.supplements
set
  description = 'A trace mineral used for bone support, especially in certain forms for postmenopausal osteoporosis.',
  what_is_it = 'Strontium is a trace mineral related to calcium, found in soil, water, and some foods. It is used for bone support as prescription strontium ranelate or over-the-counter forms such as strontium citrate.',
  why_use_it = 'Certain formulations can improve bone mineral density and reduce vertebral fracture risk in postmenopausal osteoporosis. Over-the-counter forms are used to support bone density, although evidence for fracture reduction is less robust.',
  how_does_it_work = 'Strontium incorporates into bone, partly replacing calcium and increasing measured bone density. It appears to stimulate osteoblast activity and reduce osteoclast activity, shifting bone remodelling towards net gain.',
  side_effects = 'Prescription forms may cause mild gastrointestinal upset, headache, or skin reactions. Increases in bone density on DXA scans may overestimate true structural improvement due to measurement effects.',
  risks_and_interactions = 'Strontium ranelate has been associated with increased cardiovascular risk in individuals with pre-existing disease, so use is restricted. All forms should be avoided in significant kidney impairment. Taken separately from calcium or dairy to optimise absorption.',
  who_might_benefit = 'Postmenopausal women with osteoporosis who cannot use first-line therapies may benefit from specialist-supervised treatment. Some individuals with osteopenia use strontium citrate as part of a broader bone health strategy, recognising limited evidence.',
  evidence = 'Meunier et al., 2004, New England Journal of Medicine, studied 1,649 postmenopausal women with osteoporosis and found that 2 g/day strontium ranelate for 3 years reduced new radiographic vertebral fractures by 41% versus placebo and increased lumbar spine bone mineral density by about 14%; this was ranked 7th out of 10 for bone health supplements, but use is now restricted because of cardiovascular concerns and DXA gains may overestimate true structural benefit.',
  evidence_score = 50,
  how_to_use = 'Strontium ranelate: 2 g once daily, usually at bedtime. Strontium citrate: 450-680 mg elemental daily, taken at least 2 hours away from calcium.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg elemental',
    'flags', jsonb_build_array(),
    'confidence', 0.86,
    'source_text', 'Strontium citrate: 450-680 mg elemental daily, taken at least 2 hours away from calcium.',
    'parser_method', 'manual',
    'per_intake_max_value', 680,
    'per_intake_min_value', 450,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Strontium'
  and status = 'approved';

update public.supplements
set
  description = 'Taurine is a sulfur-containing amino acid that may support cardiovascular health, blood sugar control, and exercise performance.',
  what_is_it = 'Taurine is a sulfur-containing amino acid found in meat, seafood, and energy drinks, and produced in small amounts in the body. It supports bile salt formation, calcium handling, mitochondrial function, and antioxidant defence.',
  why_use_it = 'Taurine has been studied for supporting blood pressure, vascular function, cholesterol, triglycerides, and blood sugar control. It may also support endurance performance, energy, and metabolic health, particularly in those with cardiometabolic risk.',
  how_does_it_work = 'Taurine helps regulate calcium flux and nitric oxide signalling, supporting vascular relaxation and lowering blood pressure. It also influences insulin sensitivity, lipid metabolism, mitochondrial function, and oxidative stress.',
  side_effects = 'Generally well tolerated at doses up to 3-6 g daily. Mild gastrointestinal symptoms, such as nausea or loose stools, may occur. Higher doses appear safe short term but should be used cautiously.',
  risks_and_interactions = 'Taurine has few known drug interactions, but energy drinks containing taurine with caffeine and sugar may increase heart rate and blood pressure. Use caution in kidney disease, heart failure, or with multiple cardiovascular medications.',
  who_might_benefit = 'Adults with prehypertension, type 2 diabetes, or dyslipidaemia may benefit alongside lifestyle measures. Active individuals may also consider it for endurance or recovery support.',
  evidence = 'Evidence is strongest for cardiovascular, endurance, blood sugar, and lipid outcomes. Zhang et al. (2004) in Amino Acids found 3 g/day for 12 days improved visual fatigue in 25 male students, ranked 11th of 21 for energy enhancing. Sun et al. (2016) in Hypertension found 1.6 g/day for 12 weeks lowered blood pressure by about 7/5 mmHg and improved vascular function in 120 adults with prehypertension, ranked 10th of 20 for blood pressure control. Tzang et al. (2024) in Nutrition Journal pooled 20 trials (808 people) and found 1-6 g/day lowered systolic blood pressure by about 4 mmHg and slightly reduced heart rate, ranked 3rd of 18 for cardiovascular health. Sun et al. (2024) in Nutrients found nine trials showed lower triglycerides, total cholesterol, and LDL cholesterol, with best results at 3 g/day and longer duration, ranked 12th of 26 for cholesterol support. Chen et al. (2021) in Frontiers in Physiology reviewed 10 taurine-only trials and found small-to-moderate endurance benefits and less muscle damage with acute 1-6 g doses or repeated about 1 g dosing, ranked 3rd of 26 for endurance enhancing. Tao et al. (2022) in Food Chemistry Oxford found nine diabetes trials showed lower HbA1c, fasting glucose, and insulin resistance, ranked 12th of 27 for blood sugar control. Guan et al. (2020) in Pharmacological Research found small reductions in body weight, BMI, total cholesterol, and triglycerides in 278 overweight or obese adults, ranked 12th of 22 for weight management; limitations across the evidence include small trials, mixed populations, and variable dosing and duration.',
  evidence_score = 72,
  how_to_use = 'Typical dose is 1.5-3 g daily for 8-12 weeks. For exercise, 1-4 g taken 1-2 hours before activity.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 1.5-3 g daily for 8-12 weeks. For exercise: 1-4 g taken 1-2 hours before activity.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 4,
    'per_intake_min_value', 1,
    'frequency_max_per_day', null,
    'frequency_min_per_day', null
  ),
  dose_scoring_profile_json = null
where name = 'Taurine'
  and status = 'approved';

update public.supplements
set
  description = 'A water-soluble vitamin B1 supplement that supports energy production and nervous system function.',
  what_is_it = 'Thiamine (vitamin B1) is a water-soluble B vitamin found in whole grains, legumes, pork, and fortified foods. It is an essential cofactor for mitochondrial enzymes involved in carbohydrate metabolism and ATP production.',
  why_use_it = 'Thiamine supports energy production and nervous system function. Low levels may present as fatigue, weakness, poor exercise tolerance, and reduced cognitive function. Higher-dose supplementation has been explored in cardiovascular and metabolic conditions, particularly where deficiency or increased loss is likely.',
  how_does_it_work = 'As thiamine pyrophosphate, thiamine enables efficient conversion of glucose into energy and supports ATP production in the heart, brain, and muscle. It may also influence endothelial function, oxidative stress, and glycation processes, linking it to cardiovascular and metabolic health.',
  side_effects = 'Oral thiamine is very well tolerated, with excess excreted in urine. Adverse effects at typical doses are rare. Parenteral high-dose use can rarely cause hypersensitivity reactions.',
  risks_and_interactions = 'Drug interactions are uncommon, but diuretics, high alcohol intake, and high carbohydrate diets can increase thiamine requirements. Individuals with heart failure, diabetes, or post-bariatric surgery may require monitoring.',
  who_might_benefit = 'Those with low dietary intake, high alcohol use, long-term diuretic use, heart failure, diabetes, or fatigue-related symptoms may benefit from optimising thiamine status.',
  evidence = 'Evidence is mixed but generally supportive in deficiency-prone settings: Yang et al. (2023), Frontiers in Pharmacology, reported in 7,021 ICU patients with heart failure that thiamine use was associated with lower in-hospital death and less need for ventilators, ACE inhibitors, and vasopressors, but the observational design cannot prove causation and it ranked 8th of 18 for cardiovascular health; Bager et al. (2021), Alimentary Pharmacology & Therapeutics, found in 40 patients with quiescent inflammatory bowel disease and severe fatigue that 4 weeks of high-dose oral thiamine (600-1,800 mg/day) improved fatigue versus placebo with mild side effects, ranking 15th of 21 for energy; Muley et al. (2022), BMJ Open, found in six small trials in type 2 diabetes that thiamine or benfotiamine up to 3 months did not improve long-term blood sugar but did lower triglycerides and raise HDL, with no clear effects on weight, LDL, or blood pressure, ranking 27th of 27 for blood sugar control and 22nd of 26 for cholesterol support.',
  evidence_score = 60,
  how_to_use = 'Typical intake is 1-1.2 mg daily from diet and supplements. Higher doses may be used short term under medical supervision.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical intake: 1-1.2 mg daily from diet and supplements.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 1.2,
    'per_intake_min_value', 1,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Thiamine'
  and status = 'approved';

update public.supplements
set
  description = 'A herbal root extract used to support male sexual health, testosterone, stress resilience, and vitality.',
  what_is_it = 'Tongkat ali is a herbal extract from the root of the Southeast Asian tree Eurycoma longifolia, traditionally used to support vitality and male sexual health. Standardised extracts specify a root-extract ratio or bioactive compounds such as eurycomanone.',
  why_use_it = 'Used to support male sexual function, healthy testosterone levels, stress resilience, and overall vitality. Emerging evidence also suggests potential immune-modulating and anti-inflammatory effects.',
  how_does_it_work = 'Tongkat ali appears to support the hypothalamic-pituitary-gonadal axis, increasing free testosterone by reducing sex hormone-binding globulin and possibly stimulating production. It may also help regulate cortisol and stress pathways, alongside antioxidant and immunomodulatory effects.',
  side_effects = 'Generally well tolerated at typical doses. Some individuals may experience restlessness, insomnia, or mild irritability, particularly at higher doses or if taken later in the day.',
  risks_and_interactions = 'Caution is advised in hormone-sensitive conditions. Use caution in prostate disease, uncontrolled hypertension, or significant cardiovascular disease. It may interact with medications affecting hormones, blood pressure, or glucose, although evidence is limited; monitoring is advised.',
  who_might_benefit = 'Adult men with low libido, reduced sexual function, or borderline-low testosterone, particularly when associated with stress or fatigue. It may also appeal to those seeking support for stress, recovery, and general vitality.',
  evidence = 'Evidence is strongest for male sexual function, testosterone, and stress. Ismail et al. (2021), Journal of Herbal Medicine, found that 200 mg daily for 6 months plus exercise improved erectile function and sexual symptoms in 199 men with low testosterone symptoms, with greatest benefit in those with worse baseline erectile problems. Leisegang et al. (2022), Medicina, meta-analyzed several studies in 350 adult men and found 100-600 mg per day for up to 24 weeks increased total testosterone, especially in men with low levels, with frequent improvements in free testosterone, libido, and energy, but little change in men with normal testosterone. Talbott et al. (2013), Journal of the International Society of Sports Nutrition, reported that 200 mg/day for 4 weeks reduced cortisol and improved mood measures in 63 moderately stressed participants. George et al. (2016), Phytotherapy Research, found immune marker improvements in 84 middle-aged adults with lower baseline immunological vigour. Overall, the supplement is well supported for hormonal and sexual outcomes, but studies are relatively small and some benefits appear greatest in men with low baseline status.',
  evidence_score = 87,
  how_to_use = 'Typical dose: 200-400 mg daily. For stress support: Lower doses of 200-300 mg may be sufficient. Often taken in cycles for sustained use.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('daily', 'cycled_use_possible'),
    'confidence', 0.95,
    'source_text', 'Typical dose: 200-400 mg daily. For stress support: Lower doses of 200-300 mg may be sufficient.',
    'parser_method', 'direct_range_extraction',
    'per_intake_max_value', 400,
    'per_intake_min_value', 200,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Tongkat Ali (Eurycoma longifolia)'
  and status = 'approved';

update public.supplements
set
  description = 'A herbal supplement from the aerial parts and fruits of Tribulus terrestris that is mainly used to support sexual function.',
  what_is_it = 'Tribulus terrestris is a herbal extract from the aerial parts and fruits of the plant, traditionally used as an aphrodisiac and reproductive tonic. Standardised supplements often specify saponin content, typically 40-60%.',
  why_use_it = 'Tribulus is mainly used to support sexual function. Evidence suggests modest improvements in libido and erectile function in men with mild to moderate dysfunction. It is also used for male fertility and female sexual desire and arousal.',
  how_does_it_work = 'Tribulus contains steroidal saponins, such as protodioscin, which may enhance nitric oxide activity and smooth muscle relaxation, supporting blood flow. Effects on testosterone are inconsistent but may be modest in some individuals.',
  side_effects = 'Generally well tolerated at typical doses. Mild gastrointestinal upset, headache, or restlessness may occur. Product quality varies, so standardised, reputable supplements are recommended.',
  risks_and_interactions = 'Rare reports suggest possible liver strain at very high doses, so caution is advised in liver disease. There are theoretical interactions with hormone-sensitive conditions and medications affecting hormones or blood pressure.',
  who_might_benefit = 'Men with mild erectile dysfunction or low libido may benefit, particularly alongside lifestyle measures. Women with reduced sexual desire or arousal may also see improvements.',
  evidence = 'Kamenov et al. (2017), Maturitas, a prospective randomized double-blind placebo-controlled trial in 180 men with mild to moderate erection problems, found Tribulus terrestris 750 mg daily for 12 weeks improved erection quality, sexual desire, orgasm, and satisfaction versus placebo and was well tolerated, ranked 3rd of 10 for male sexual arousal supplements, with the main limitation that it was a single trial. de Souza et al. (2025), Nutrients, a systematic review of 808 men, found Tribulus did not consistently or meaningfully increase total testosterone and ranked 9th of 9 for testosterone enhancing supplements, with better-quality trials showing no real difference versus placebo. Ara et al. (2023), Andrologia, a meta-analysis of 133 men with fertility problems, found improved sperm concentration and movement without clear hormone changes, ranked 5th of 6 for male fertility supplements, with limited study size. de Souza et al. (2016), Menopause, a randomized double-blind placebo-controlled trial in 45 postmenopausal women found 750 mg daily for 120 days improved sexual desire, arousal, and lubrication and caused few side effects, ranked 4th of 7 for female sexual arousal supplements, with a small sample size.',
  evidence_score = 62,
  how_to_use = 'For sexual function, 400-750 mg daily. For fertility support, around 750 mg daily over 4-12 weeks.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'For sexual function: 400-750 mg daily. For fertility support: Around 750 mg daily over 4-12 weeks.',
    'parser_method', 'direct_range_and_main_dose_extraction',
    'per_intake_max_value', 750,
    'per_intake_min_value', 400,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Tribulus Terrestris'
  and status = 'approved';

update public.supplements
set
  description = 'A gut-derived compound that may support mitochondrial health and muscle function, especially in people who do not produce it naturally.',
  what_is_it = 'Urolithin A is a gut-derived metabolite produced from ellagitannins found in foods such as pomegranates and walnuts. Only around 30-40% of people produce it naturally, so supplementation can provide a direct source for most people.',
  why_use_it = 'The strongest evidence supports benefits for muscle endurance and strength in older and middle-aged adults. Emerging data suggest potential roles in immune function and healthy ageing through mitochondrial support.',
  how_does_it_work = 'Urolithin A activates mitophagy via pathways such as PINK1/Parkin, helping remove damaged mitochondria and improve cellular energy efficiency. It may also reduce inflammatory markers and support immune cell function.',
  side_effects = 'Generally well tolerated at doses up to 1,000 mg daily for several months. Mild gastrointestinal symptoms or headache are occasionally reported. No serious adverse events have been identified in trials.',
  risks_and_interactions = 'No confirmed drug interactions, although data are limited. Caution is advised with immunosuppressive or mitochondrial-targeting therapies. Long-term safety beyond several months remains under investigation.',
  who_might_benefit = 'Older adults seeking support for muscle endurance and function, middle-aged individuals aiming to maintain strength, and people who do not naturally produce urolithin A.',
  evidence = 'Kuerec et al. (2024), Ageing Research Reviews, reviewed five small human studies in about 250 adults and found that 4 weeks to 4 months of oral urolithin A reduced inflammation and improved cellular energy and recycling pathways, but there is still no proof it extends life or prevents specific diseases; ranked 9th of 15 for anti-ageing supplements. Singh et al. (2022), Cell Reports Medicine, studied 88 adults aged 40-64 and found that 500-1,000 mg daily for 4 months increased leg strength by about 12% and improved fitness and walking distance versus placebo, with the biggest gains at 1,000 mg; ranked 5th of 19 for strength enhancing supplements. Zhao et al. (2024), Journal of the International Society of Sports Nutrition, found in 20 resistance-trained men that 1 g daily for 8 weeks slightly lowered CRP and showed a small non-significant trend toward lower IL-6 versus placebo, suggesting a mild anti-inflammatory effect; ranked 25th of 38 for anti-inflammatory supplements. Liu et al. (2021), Innovation in Aging, reported in adults aged 65-90 that daily urolithin A for 4 months improved resistance to muscle fatigue and repeated contractions versus placebo, suggesting better muscle function under repeated effort; ranked 23rd of 26 for endurance enhancing supplements.',
  evidence_score = 57,
  how_to_use = 'For muscle support, around 1,000 mg daily for at least 4 months. General use is 500-1,000 mg daily with meals.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'For muscle support: Around 1,000 mg daily for at least 4 months. General: 500-1,000 mg daily with meals.',
    'parser_method', 'direct_text_parse',
    'per_intake_max_value', 1000,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Urolithin A'
  and status = 'approved';

update public.supplements
set
  description = 'A herbal root extract used mainly to support sleep and relaxation.',
  what_is_it = 'Valerian root is a herbal extract from the roots and rhizomes of Valeriana officinalis, traditionally used as a mild sedative and nerve tonic. Modern preparations include capsules, tablets, tinctures, and teas standardized to compounds such as valerenic acids.',
  why_use_it = 'Valerian is mainly used to support sleep onset and subjective sleep quality in people with mild insomnia or difficulty winding down. It is also used for stress relief and mild anxiety, often alongside sleep-hygiene measures.',
  how_does_it_work = 'Valerian appears to modulate GABA signaling by inhibiting its breakdown and interacting with receptors, promoting relaxation and reducing central nervous system activity. It may also influence adenosine and serotonin pathways, supporting sleep and stress reduction.',
  side_effects = 'Generally well tolerated with short-term use. Possible effects include next-morning drowsiness, vivid dreams, headache, or mild gastrointestinal upset, particularly at higher doses. Long-term safety data are limited.',
  risks_and_interactions = 'Valerian may enhance the effects of other sedatives, including benzodiazepines, antihistamines, opioids, and alcohol. Avoid in pregnancy and breastfeeding. Use caution when driving or operating machinery until effects are known.',
  who_might_benefit = 'Adults with mild sleep difficulties or situational stress who prefer a herbal approach, particularly when combined with lifestyle measures.',
  evidence = 'Shinjyo et al. (2020), Journal of Evidence-Based Integrative Medicine, a systematic review and meta-analysis, found that across 60 trials with 6,894 participants valerian alone produced small but significant improvements in subjective sleep quality and sleep latency versus placebo, especially in chronic insomnia, but objective polysomnography changes were minimal; it was ranked 3rd out of 11 for sleep support and the evidence is limited by small effects and variable trial quality. Roh et al. (2019), Phytotherapy Research, a randomized double-blind placebo-controlled trial in 64 psychologically stressed adults found 100 mg valerian extract three times daily for 4 weeks did not significantly outperform placebo on anxiety or stress questionnaires, though it increased frontal alpha EEG coherence correlated with anxiolytic effects; it was ranked 15th out of 15 for stress relief and the clinical benefit was not demonstrated.',
  evidence_score = 66,
  how_to_use = 'For sleep, take 400-900 mg 30-60 minutes before bed. For stress, take 120-200 mg up to three times daily.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'For sleep: 400-900 mg taken 30-60 minutes before bed. For stress: 120-200 mg up to three times daily.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 900,
    'per_intake_min_value', 120,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Valerian Root (Valeriana officinalis)'
  and status = 'approved';

update public.supplements
set
  description = 'A water-soluble B vitamin needed for red blood cell formation, nerve function, and DNA synthesis, especially important for vegans and people at risk of deficiency.',
  what_is_it = 'Vitamin B12 is a water-soluble B vitamin found mainly in animal foods such as meat, fish, eggs, and dairy, as well as fortified products. It is essential for red blood cell formation, myelin integrity, and DNA synthesis. Absorption depends on intrinsic factor and a healthy terminal ileum.',
  why_use_it = 'B12 supports energy production and nervous system function. Low levels can present as fatigue, weakness, reduced exercise tolerance, and cognitive slowing. It also helps regulate homocysteine, a marker linked to cardiovascular risk.',
  how_does_it_work = 'B12 acts as a cofactor for enzymes involved in mitochondrial energy production and methylation processes. It supports synthesis of S-adenosylmethionine and works with folate to convert homocysteine to methionine, supporting metabolic and vascular health.',
  side_effects = 'Oral B12 has an excellent safety profile, with doses up to 2,000 mcg daily well tolerated. Mild side effects such as headache, gastrointestinal upset, or skin changes are uncommon.',
  risks_and_interactions = 'Absorption may be reduced by metformin, proton-pump inhibitors, and H2 blockers. Nitrous oxide exposure can also impair B12 function. Supplementation is generally safe but should be targeted to deficiency or increased need.',
  who_might_benefit = 'Vegans, older adults, and those on long-term metformin or acid-suppressing therapy are at higher risk of deficiency. Individuals with fatigue, neuropathy, or macrocytic anaemia may also benefit from assessment and supplementation.',
  evidence = 'van Campen et al. (2019), PLoS One, open trial in 51 adults with ME/CFS found vitamin B12 nasal drops increased blood B12 and were associated with reduced fatigue scores, improved physical function, and higher daily step count versus baseline; ranked 7th of 21 for energy enhancing supplements, with no control group and baseline comparison only. Kwok et al. (2012), European Journal of Clinical Nutrition, found vitamin B12 tablets improved arterial function in vegetarians with subnormal B12; ranked 11th of 18 for cardiovascular health supplements, but long-term heart outcomes were not tested and benefits appeared limited to deficient people.',
  evidence_score = 52,
  how_to_use = 'Typical dose: 500-1,000 mcg daily. For deficiency: Around 1,000 mcg daily for 4-12 weeks, then reassess.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mcg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 500-1,000 mcg daily. For deficiency: Around 1,000 mcg daily for 4-12 weeks, then reassess.',
    'parser_method', 'rule-based',
    'per_intake_max_value', 1000,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Vitamin B12 (Cobalamin)'
  and status = 'approved';

update public.supplements
set
  description = 'A water-soluble vitamin that supports collagen, antioxidant, immune, and vascular function and is commonly taken as a supplement.',
  what_is_it = 'Vitamin C is a water-soluble vitamin found in fruits and vegetables such as citrus, berries, peppers, and kiwifruit, and widely available as a supplement. It is essential for collagen synthesis, antioxidant defence, carnitine production, and normal immune and vascular function.',
  why_use_it = 'Vitamin C supports skin health, wound healing, immune function, and blood vessel health. It may also help with blood pressure regulation and cardiovascular support. It is commonly used to aid recovery from injury or illness and to support overall resilience.',
  how_does_it_work = 'Vitamin C is a cofactor for enzymes involved in collagen formation, supporting tissue strength and repair. As a potent antioxidant, it neutralises reactive oxygen species, regenerates vitamin E, and supports nitric oxide-mediated vasodilation. It also modulates immune cell function.',
  side_effects = 'Generally well tolerated at doses up to 1,000-2,000 mg daily. Higher intakes may cause gastrointestinal upset, including bloating or loose stools.',
  risks_and_interactions = 'Those with kidney stone history or kidney disease should be cautious with high doses. High doses may increase urinary oxalate in susceptible individuals and may interfere with some laboratory tests. Clinically significant drug interactions are uncommon, but caution is advised in complex medical conditions.',
  who_might_benefit = 'Individuals with low fruit and vegetable intake, smokers, older adults, and those under increased oxidative stress may benefit. It may also support those focusing on recovery, immune health, or cardiovascular risk.',
  evidence = 'Evidence is strongest for immune health and injury recovery, with additional support for skin health and blood pressure. Hemila and Chalker (2023) in BMC Infectious Diseases found that in 10 randomised, double-blind trials of generally healthy adults taking at least 1 g/day, regular vitamin C reduced common-cold severity by about 15% and shortened more severe symptoms; it ranked 4th of 19 for immune health. Stephens et al. (2016) in the Journal of Clinical and Aesthetic Dermatology reported that 61 women with facial photodamage taking an oral supplement containing vitamin C 54 mg daily for 16 weeks improved several skin measures versus placebo; it ranked 7th of 20 for skin health. Juraschek et al. (2012) in the American Journal of Clinical Nutrition found across 29 trials with 1,407 participants that vitamin C lowered blood pressure modestly, especially in hypertensive participants; it ranked 9th of 20 for blood pressure control. Bechara et al. (2022) in Antioxidants reviewed 18 clinical trials and concluded vitamin C supports tissue repair by promoting collagen synthesis, reducing oxidative stress, and enhancing wound healing, particularly in deficiency or higher demand; it ranked 1st of 5 for injury recovery. Lu et al. (2018) in the Journal of International Medical Research found that 1,000 mg/day for 2 months improved embryo quality markers in women with endometriosis undergoing IVF but did not improve pregnancy outcomes; it ranked 9th of 9 for female fertility, suggesting limited clinical benefit there.',
  evidence_score = 67,
  how_to_use = 'Typical dose: 500-1,000 mg daily. Split doses may improve tolerance at higher intakes.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: 500-1,000 mg daily.',
    'parser_method', 'direct_range_parse',
    'per_intake_max_value', 1000,
    'per_intake_min_value', 500,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Vitamin C (Ascorbic Acid)'
  and status = 'approved';

update public.supplements
set
  description = 'A fat-soluble vitamin-hormone supplement that supports bone, muscle, immune, and other health functions, especially when vitamin D levels are low.',
  what_is_it = 'Vitamin D is a fat-soluble, hormone-like vitamin produced in the skin via sunlight and obtained from foods such as fatty fish, egg yolks, and fortified products, or supplements (usually vitamin D3). It is converted in the liver and kidneys into active forms that act on vitamin D receptors throughout the body.',
  why_use_it = 'Vitamin D is essential for bone health, muscle function, and immune regulation. Adequate levels are linked to improved bone density, reduced fall risk, and better immune responses. It may also support mood, blood pressure, and aspects of reproductive and cardiometabolic health.',
  how_does_it_work = 'Active vitamin D regulates calcium and phosphate balance, supporting bone mineralisation and muscle function. It also has anti-inflammatory and immunomodulatory effects, influences blood pressure regulation, and plays a role in insulin sensitivity and hormone signalling.',
  side_effects = 'At typical doses up to about 4,000 IU daily, vitamin D is generally safe. Toxicity is rare but can occur with prolonged high intake, leading to hypercalcaemia and related symptoms.',
  risks_and_interactions = 'Supplementation should be tailored to baseline levels and individual factors. Caution is required in conditions affecting calcium metabolism, such as hyperparathyroidism or advanced kidney disease. Total calcium intake should be considered when combined with calcium supplements.',
  who_might_benefit = 'Individuals with low sun exposure, older adults, those with darker skin, obesity, or malabsorption are at higher risk of deficiency. Commonly used to support bone, immune, and overall health.',
  evidence = 'Evidence is strong across multiple areas. Zhu et al. (2025), American Journal of Clinical Nutrition, found that 2,000 IU vitamin D3 daily for 4 years in 2,147 adults aged 50+ slowed telomere shortening and was estimated to prevent about 3 years of biological ageing, ranked 1st of 15 for anti-ageing, though this was a sub-study. Bischoff-Ferrari et al. (2009), Archives of Internal Medicine, pooled 12 double-blind trials in more than 35,000 adults aged 65+ and found higher-dose vitamin D reduced non-spine fractures by about 20% and hip fractures by about 18%, ranked 1st of 10 for bone health. Pilz et al. (2011), Hormone and Metabolic Research, reported that 3,332 IU daily for a year increased testosterone in 54 overweight men with low vitamin D, ranked 5th of 9 for testosterone, but the study was small. Chen et al. (2024), Diabetes, Obesity and Metabolism, pooled 39 studies in 2,982 adults with type 2 diabetes and found improvements in fasting glucose, HbA1c, HOMA-IR, and fasting insulin, ranked 10th of 27 for blood sugar control, with greater effects in deficient participants. Heidari et al. (2024), Clinical Nutrition ESPEN, found that 50,000 IU every 2 weeks for 4 months reduced PMS symptoms in 96 vitamin D-insufficient women, ranked 2nd of 13 for female hormone balance. Jolliffe et al. (2025), The Lancet Diabetes & Endocrinology, analyzed 31 trials with 36,857 people and found a slight reduction in acute respiratory infections, ranked 3rd of 19 for immune health, with clearer benefit from regular daily or weekly dosing and in those starting low. Wang et al. (2025), Frontiers in Psychiatry, pooled 20 trials with 3,024 people and found a moderate reduction in depression scores, ranked 3rd of 18 for mood support, especially in those with depression and low baseline vitamin D. Zhou et al. (2023), International Journal of Epidemiology, used genetic data from nearly 300,000 individuals and found low vitamin D likely causes higher CRP, ranked 13th of 38 for anti-inflammatory effects, but this was Mendelian randomisation rather than a supplementation trial. Zhou et al. (2022), Frontiers in Endocrinology, pooled IVF trials with 823 participants and found a modest increase in chemical pregnancy but no clear improvement in clinical pregnancy or live birth, ranked 3rd of 9 for female fertility. Serra et al. (2024), American Journal of Hypertension, analyzed 17 trials with 1,429 hypertensive adults with low vitamin D and found a small reduction in systolic blood pressure, ranked 15th of 20 for blood pressure control, especially in older adults receiving higher total doses.',
  evidence_score = 94,
  how_to_use = 'Typical dose: 1,000-2,000 IU daily. Higher doses up to 4,000 IU may be used short term under supervision.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'IU',
    'flags', jsonb_build_array(),
    'confidence', 0.96,
    'source_text', 'Typical dose: 1,000-2,000 IU daily. Higher doses (up to 4,000 IU) may be used short term under supervision.',
    'parser_method', 'explicit_range_and_frequency',
    'per_intake_max_value', 2000,
    'per_intake_min_value', 1000,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Vitamin D / D3/ Cholecalciferol'
  and status = 'approved';

update public.supplements
set
  description = 'A fat-soluble antioxidant supplement that supports cell protection, skin and hair health, and may help in selected uses such as inflammation or fertility.',
  what_is_it = 'Vitamin E is a fat-soluble antioxidant found in nuts, seeds, plant oils, and wheat germ. It is available as natural (d-alpha-tocopherol) or synthetic (dl-alpha-tocopherol) supplements and protects cell membranes and lipids from oxidative damage. Tocotrienols are a vitamin E form that has shown particular promise for hair health.',
  why_use_it = 'Vitamin E supports skin and hair health, protects lipids from oxidation, and contributes to anti-inflammatory balance. It is also used in fertility support and for general cardiovascular and cognitive health, although evidence at higher doses is mixed.',
  how_does_it_work = 'Vitamin E acts as a chain-breaking antioxidant, neutralising lipid peroxyl radicals and reducing oxidative stress. It also modulates inflammatory pathways, supporting vascular, skin, and tissue health.',
  side_effects = 'Generally well tolerated at modest doses. Mild gastrointestinal symptoms or headache may occur.',
  risks_and_interactions = 'Long-term high doses (400 IU or more daily) have been linked to increased bleeding risk and small increases in all-cause mortality. High-dose vitamin E may increase bleeding risk, particularly with anticoagulants or antiplatelet drugs. Routine high-dose use in pregnancy is not recommended without medical advice.',
  who_might_benefit = 'Most individuals meet needs through diet, but those with low intake, malabsorption, or higher oxidative stress may benefit. It may also be considered in fertility or skin-focused protocols.',
  evidence = 'Evidence is strongest for hair health: Zhou et al. (2026), Frontiers in Nutrition, a systematic review and network meta-analysis of 19 trials with 1,658 people found tocotrienol vitamin E clearly increased hair density versus placebo, including one 8-month study with about a 35% increase in hair count, ranking 2nd of 11 but with limited direct trial data. Other supportive findings include Wang et al. (2024), Lipids in Health and Disease, a cross-sectional study of 8,469 US adults linking higher vitamin E intake with a better cholesterol profile; Asbaghi et al. (2020), Scientific Reports, a meta-analysis of 33 randomized trials showing reductions in CRP, IL-6, and TNF-alpha, especially with alpha-tocopherol 500 mg or more daily for at least 8 weeks; Jaffary et al. (2015), Journal of Research in Medical Sciences, a 70-person eczema trial showing 400 IU daily improved symptoms; Wu et al. (2021), Clinical and Experimental Obstetrics & Gynecology, a meta-analysis of 652 participants showing improved endometrial thickness but not pregnancy rates; and Vallibhakara et al. (2021), Menopause, a 52-person trial showing 400 IU/day mixed tocopherols reduced bone turnover without changing bone density over 12 weeks.',
  evidence_score = 77,
  how_to_use = 'Typical dose: 100-200 IU daily. Avoid long-term high doses unless supervised.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'IU',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 100-200 IU daily.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 200,
    'per_intake_min_value', 100,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Vitamin E / Tocotrienols'
  and status = 'approved';

update public.supplements
set
  description = 'A fat-soluble vitamin that helps blood clotting, supports bone health, and may help keep calcium out of artery walls.',
  what_is_it = 'Vitamin K is a fat-soluble vitamin found as vitamin K1 from leafy greens and vitamin K2 (menaquinones such as MK-4 and MK-7) from fermented and animal foods. It activates proteins involved in blood clotting, bone mineralisation, and regulation of vascular calcification.',
  why_use_it = 'Vitamin K supports bone health by enabling osteocalcin to bind calcium in bone. It also supports cardiovascular health by activating matrix Gla protein, which helps limit arterial calcification. K2 forms, particularly MK-7, may help maintain bone density and vascular flexibility over time.',
  how_does_it_work = 'Vitamin K acts as a cofactor for gamma-glutamyl carboxylase, activating proteins that regulate calcium use in the body. This promotes proper calcium deposition in bone and helps prevent accumulation in arterial walls.',
  side_effects = 'Generally well tolerated at typical dietary and supplemental doses. Adverse effects are rare. High-dose MK-4 used in specialist settings requires medical supervision.',
  risks_and_interactions = 'Vitamin K can interact with anticoagulants such as warfarin, affecting clotting control. Intake should remain consistent, and supplementation should only be adjusted under medical guidance.',
  who_might_benefit = 'Postmenopausal women and older adults with low bone density may benefit, particularly when combined with vitamin D and adequate calcium. It may also support individuals concerned with long-term cardiovascular health.',
  evidence = 'Ma et al. (2022), Frontiers in Endocrinology, a systematic review and meta-analysis of 16 randomized controlled trials in 6,425 postmenopausal women found vitamin K2, mostly MK-4 or MK-7, significantly reduced vertebral and non-vertebral fractures with modest, site-dependent bone mineral density effects; ranked 2nd of 10 for bone health supplements, with evidence limited by variable formulations and modest BMD changes. Knapen et al. (2015), Thrombosis and Haemostasis, a 3-year randomized clinical trial in 244 healthy postmenopausal women found 180 micrograms/day MK-7 slowed arterial stiffening and improved carotid elasticity versus placebo, especially in those with stiffer arteries at baseline; ranked 6th of 18 for cardiovascular health supplements, with benefit shown mainly on vascular stiffness rather than hard outcomes.',
  evidence_score = 74,
  how_to_use = 'Typical dose: MK-7 at around 180 micrograms daily. Higher-dose MK-4 is used under specialist supervision only.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'micrograms',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical dose: MK-7 at around 180 micrograms daily.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 180,
    'per_intake_min_value', 180,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Vitamin K'
  and status = 'approved';

update public.supplements
set
  description = 'A herbal extract from the chaste tree used mainly for PMS and related menstrual symptoms.',
  what_is_it = 'Vitex agnus-castus (chaste tree) is a herbal extract from a Mediterranean plant. It contains flavonoids and iridoids, with standardised extracts typically 20-40 mg used to influence hormonal regulation.',
  why_use_it = 'Vitex is primarily used for premenstrual syndrome (PMS) and PMDD symptoms, including mood changes and bloating. It is also used for cyclic breast pain, menstrual irregularity, and to support fertility in luteal phase defects.',
  how_does_it_work = 'Vitex stimulates dopamine D2 receptors, reducing prolactin secretion. This helps normalise the hypothalamic-pituitary-gonadal axis, improving the LH/FSH balance and supporting progesterone production.',
  side_effects = 'Generally well tolerated. Mild nausea, headache, gastrointestinal upset, acne, or rash may occur. Effects typically require at least 3 months of consistent use.',
  risks_and_interactions = 'Contraindicated in pregnancy and breastfeeding, hormone-sensitive cancers, and with oral contraceptives or HRT, as it may interfere with effectiveness. It may interact with antipsychotic or Parkinson''s medications due to dopamine effects.',
  who_might_benefit = 'Women with PMS, cyclic breast pain, irregular cycles, or luteal phase defects may benefit. It is not suitable for those using hormonal contraception.',
  evidence = 'Csupor et al. (2019), Complementary Therapies in Medicine, meta-analysis of double-blind randomized controlled trials in 520 women with PMS found Vitex lowered overall symptom scores including irritability, low mood, and anxiety versus placebo or vitamin B6, with generally good tolerability despite variation in dose and product; ranked 3rd of 15 for female hormone balance supplements. Yousefi et al. (2021), Shiraz E-Medical Journal, randomized clinical trial in postmenopausal women found Vitex significantly reduced depression scores versus placebo with good tolerability, but larger trials are needed; ranked 14th of 18 for mood support supplements.',
  evidence_score = 65,
  how_to_use = 'Typical dose is 20-40 mg daily of a standardized extract, taken in the morning for at least 3 months.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array('standardized_extract'),
    'confidence', 0.93,
    'source_text', 'Typical dose: 20-40 mg daily (standardised extract). Note: Take in the morning for at least 3 months.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 40,
    'per_intake_min_value', 20,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Vitex Agnus-Castus (Chasteberry)'
  and status = 'approved';

update public.supplements
set
  description = 'A fast-digesting milk protein supplement used to support muscle repair, recovery, and overall protein intake.',
  what_is_it = 'Whey is the fast-digesting protein fraction of milk, rich in essential amino acids, particularly leucine. It is typically consumed as a powder (concentrate, isolate, or hydrolysate) mixed with water or milk.',
  why_use_it = 'Whey supports muscle repair, strength, and recovery by providing rapidly available amino acids. It can also aid weight management through satiety and lean mass preservation, support immune function, and help moderate post-meal blood sugar responses.',
  how_does_it_work = 'Whey delivers essential amino acids, especially leucine, to stimulate muscle protein synthesis and reduce breakdown. It may also support immune function via bioactive peptides, while improved body composition can indirectly benefit metabolic health.',
  side_effects = 'Generally well tolerated. Bloating, gas, or loose stools may occur, particularly in lactose intolerance; isolates are often better tolerated.',
  risks_and_interactions = 'Those with dairy allergy should avoid whey. Use cautiously in kidney disease. Safe for most individuals when used within recommended protein intake, but very high total protein may be problematic in pre-existing kidney disease. Some products contain added sugars or sweeteners.',
  who_might_benefit = 'Athletes, older adults, and individuals recovering from injury or surgery. It may also help those targeting weight management, blood sugar control, or improved protein intake.',
  evidence = 'Li et al. (2019), Food & Function, meta-analysis of 21 trials in 837 people found whey with resistance training increased strength and lean mass and reduced fat, especially in adults under 40, ranked 2nd of 20 for strength enhancement; Gu (2023), Revista Brasileira de Medicina do Esporte, review found post-workout whey lowered muscle-damage markers but trials were small and functional outcomes limited, ranked 5th of 9 for recovery; Sepandi et al. (2022), Clinical Nutrition ESPEN, meta-analysis of 16 trials in 1,828 overweight or obese adults found small reductions in weight, BMI, and fat with slight lean-mass gains, especially with calorie restriction and resistance training, ranked 2nd of 22 for weight management; Amirani et al. (2020), Clinical Nutrition ESPEN, meta-analysis of 22 trials in people with type 2 diabetes or metabolic syndrome found modest improvements in HbA1c, fasting insulin, HOMA-IR, and lipids, ranked 14th of 27 for blood sugar control; Lin et al. (2021), Nutrition Research Reviews, meta-analysis of 18 endurance-training trials in 1,162 people found small gains in VO2peak, lean mass, and time-trial performance, especially when baseline protein intake was under 1.6 g/kg/day, ranked 9th of 26 for endurance; Bumrungpert et al. (2018), Journal of Medicinal Food, randomized trial in 80 frail undernourished older adults found 12 weeks of whey improved albumin, IgG, glutathione, and inflammatory markers, ranked 16th of 19 for immune health; overall evidence is broad and strong across multiple outcomes, with some studies limited by small samples or modest functional endpoints.',
  evidence_score = 84,
  how_to_use = 'Typical serving: 20-30 g per dose, post-exercise or as part of meals. Use 1-2 servings daily depending on total protein needs.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'g',
    'flags', jsonb_build_array(),
    'confidence', 0.95,
    'source_text', 'Typical serving: 20-30 g per dose, post-exercise or as part of meals. Note: 1-2 servings daily depending on total protein needs.',
    'parser_method', 'direct_text_parse',
    'per_intake_max_value', 30,
    'per_intake_min_value', 20,
    'frequency_max_per_day', 2,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Whey Protein'
  and status = 'approved';

update public.supplements
set
  description = 'A stimulant alkaloid used mainly for erectile dysfunction, with modest benefits and notable side effects.',
  what_is_it = 'Yohimbine is an indole alkaloid originally derived from the bark of the African yohimbe tree (Pausinystalia yohimbe). It is most reliably used as synthetic yohimbine hydrochloride in standardized doses. It acts as an alpha-2 adrenergic receptor antagonist with stimulant and pro-erectile effects. Yohimbine has a narrow therapeutic window.',
  why_use_it = 'Yohimbine has been used for male sexual arousal and erectile dysfunction. Older studies show modest benefit in some men, although effects are generally weaker than modern treatments. It may be considered where first-line options are unsuitable.',
  how_does_it_work = 'Yohimbine blocks presynaptic alpha-2 receptors, increasing norepinephrine release and sympathetic activity. This can enhance penile blood flow and central arousal pathways, although responses vary.',
  side_effects = 'Common side effects include increased heart rate, elevated blood pressure, anxiety, jitteriness, sweating, nausea, and insomnia. More serious adverse effects have been reported, particularly at higher doses or with other stimulants.',
  risks_and_interactions = 'Contraindicated in cardiovascular disease, uncontrolled hypertension, arrhythmias, anxiety or psychiatric disorders, kidney disease, and with stimulant use. Non-standardized supplements may have variable dosing and increased risk.',
  who_might_benefit = 'Adult men with mild erectile dysfunction who cannot use first-line treatments and have no major contraindications, under medical supervision.',
  evidence = 'Wibowo et al. (2021), Turkish Journal of Urology, systematic review and meta-analysis of 16 studies found yohimbine alone increased the chance of improved erections versus placebo, with stronger effects in some combinations such as yohimbine plus L-arginine, but it did not clearly improve overall sexual desire or satisfaction; ranked 6th out of 10 for male sexual arousal supplements and limited by older heterogeneous studies and modest overall effects.',
  evidence_score = 55,
  how_to_use = 'Typical dose: 5-10 mg three times daily. Start low and titrate cautiously while monitoring side effects.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 5-10 mg three times daily.',
    'parser_method', 'direct_parse',
    'per_intake_max_value', 10,
    'per_intake_min_value', 5,
    'frequency_max_per_day', 3,
    'frequency_min_per_day', 3
  ),
  dose_scoring_profile_json = null
where name = 'Yohimbine'
  and status = 'approved';

update public.supplements
set
  description = 'An essential trace mineral that supports immune function, tissue repair, skin health, and hormone balance.',
  what_is_it = 'Zinc is an essential trace mineral involved in numerous enzymes, DNA and RNA synthesis, cell division, and tissue repair. It is found in foods such as oysters, red meat, poultry, dairy, nuts, seeds, and whole grains. Common forms include zinc gluconate, citrate, picolinate, and sulfate.',
  why_use_it = 'Zinc supports immune function, skin and hair health, reproductive hormone balance, and gut integrity. It may help with wound healing, acne, and fertility, particularly in individuals with low zinc status.',
  how_does_it_work = 'Zinc supports antioxidant enzymes, stabilises cell membranes, and is essential for immune cell function. It also plays a role in hormone signalling, including testosterone and reproductive processes, and supports skin and gut barrier function.',
  side_effects = 'Generally well tolerated at typical doses. Higher intakes may cause nausea, metallic taste, or gastrointestinal upset, especially on an empty stomach. Long-term high doses can impair copper absorption.',
  risks_and_interactions = 'Zinc may reduce absorption of copper and iron and can interact with certain antibiotics. Doses should be spaced by at least 2 hours. Medical advice is recommended for long-term high-dose use.',
  who_might_benefit = 'Individuals with low dietary intake, frequent infections, poor wound healing, acne, hair loss, or confirmed deficiency. It may also support fertility and those with gut-related conditions.',
  evidence = 'Hunter et al. (2021), BMJ Open, a rapid systematic review and meta-analysis of 28 randomized trials in 5,446 adults found oral or nasal zinc prevented about 5 viral respiratory infections per 100 person-months and shortened colds by about 2 days, but caused more mild side effects and was limited by trial heterogeneity; Te et al. (2023), Journal of Trace Elements in Medicine and Biology, a systematic review of 8 human clinical studies found zinc deficiency was consistently linked to lower testosterone and supplementation helped mainly in deficient or hypogonadal men; Ali et al. (2024), Journal of Global Health, a meta-analysis of over 89 trials in more than 23,000 children found daily oral zinc usually 10-20 mg shortened acute diarrhoea by about half a day to three-quarters of a day and reduced persistent cases; Yee et al. (2020), Dermatologic Therapy, a systematic review and meta-analysis of 2,445 acne patients found lower blood zinc levels in acne and reduced inflamed lesions with oral or topical zinc, especially as an add-on; Mahmoud et al. (2024), Cureus, an observational study of 125 adults with hair loss found lower zinc levels than healthy controls; Nossier et al. (2015), British Journal of Nutrition, in 675 zinc-deficient pregnant women, 30 mg/day slightly improved some birth outcomes in higher-risk subgroups but not overall miscarriage or stillbirth outcomes.',
  evidence_score = 86,
  how_to_use = 'Typical dose: 8-15 mg daily. Short-term: 15-30 mg daily. Avoid long-term high doses without supervision.',
  recommended_dose_status = 'parsed',
  recommended_dose_json = jsonb_build_object(
    'unit', 'mg',
    'flags', jsonb_build_array(),
    'confidence', 0.93,
    'source_text', 'Typical dose: 8-15 mg daily. Short-term: 15-30 mg daily.',
    'parser_method', 'direct_extraction',
    'per_intake_max_value', 30,
    'per_intake_min_value', 8,
    'frequency_max_per_day', 1,
    'frequency_min_per_day', 1
  ),
  dose_scoring_profile_json = null
where name = 'Zinc'
  and status = 'approved';

commit;
