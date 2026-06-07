import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Star, ShieldCheck, Package, Loader2, AlertCircle,
  ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AssessmentResponse, MatchedRecommendation, GoalRecommendation } from '../types/assessment';

// ─── Goal → Product recommendation map ──────────────────────

const GOAL_RECOMMENDATIONS: Record<string, GoalRecommendation[]> = {
  weight_5_10kg: [
    { product: 'Semaglutide', reason: 'Proven GLP-1 agonist for moderate weight loss (5–10 kg)', priority: 'primary' },
    { product: 'Lipo-C', reason: 'Lipotropic support for enhanced fat metabolism', priority: 'supporting' },
  ],
  weight_10_20kg: [
    { product: 'Tirzepatide 15mg', reason: 'Dual GIP/GLP-1 agonist for significant weight loss (10–20 kg)', priority: 'primary' },
    { product: 'AOD-9604', reason: 'HGH fragment for targeted fat metabolism', priority: 'supporting' },
  ],
  weight_20plus: [
    { product: 'Tirzepatide 30mg', reason: 'Maximum strength for aggressive weight loss (20+ kg)', priority: 'primary' },
    { product: 'Retatrutide', reason: 'Triple agonist for maximum metabolic impact', priority: 'supporting' },
  ],
  weight_maintain: [
    { product: 'CJC-1295 (No DAC) + Ipamorelin', reason: 'Metabolic support and body composition maintenance', priority: 'primary' },
  ],
  energy_mild: [
    { product: 'BPC-157', reason: 'Supports mitochondrial function and cellular energy', priority: 'primary' },
    { product: 'NAD+ 100mg', reason: 'Essential coenzyme for cellular energy production', priority: 'supporting' },
  ],
  energy_chronic: [
    { product: 'TB-500', reason: 'Promotes cellular healing for chronic fatigue recovery', priority: 'primary' },
    { product: 'MOTS-C', reason: 'Mitochondrial peptide for enhanced energy metabolism', priority: 'supporting' },
  ],
  recovery_athletic: [
    { product: 'BPC-157', reason: 'Accelerates tissue repair and reduces inflammation', priority: 'primary' },
    { product: 'TB-500', reason: 'Promotes cell migration and healing', priority: 'supporting' },
  ],
  muscle_building: [
    { product: 'CJC-1295 (No DAC) + Ipamorelin', reason: 'Stimulates growth hormone for muscle development', priority: 'primary' },
    { product: 'Ipamorelin', reason: 'Selective GH secretagogue with minimal side effects', priority: 'supporting' },
  ],
  body_recomposition: [
    { product: 'CJC-1295 (No DAC) + Ipamorelin', reason: 'Enhances fat metabolism while preserving lean muscle', priority: 'primary' },
    { product: 'AOD-9604', reason: 'Targets fat loss without affecting muscle mass', priority: 'supporting' },
  ],
  anti_aging: [
    { product: 'Epithalon', reason: 'Telomerase activator for cellular longevity', priority: 'primary' },
    { product: 'NAD+ 500mg', reason: 'High-dose NAD+ for anti-aging and DNA repair', priority: 'supporting' },
  ],
  cognitive_function: [
    { product: 'Semax', reason: 'Nootropic peptide for mental clarity and focus', priority: 'primary' },
    { product: 'Selank', reason: 'Anxiolytic and cognitive enhancer', priority: 'supporting' },
  ],
  immune_support: [
    { product: 'BPC-157', reason: 'Anti-inflammatory peptide that supports immune system recovery', priority: 'primary' },
    { product: 'NAD+', reason: 'Essential coenzyme for cellular repair and immune function', priority: 'supporting' },
  ],
};

const GOAL_LABELS: Record<string, string> = {
  weight_5_10kg: 'Lose 5–10 kg',
  weight_10_20kg: 'Lose 10–20 kg',
  weight_20plus: 'Lose 20+ kg',
  weight_maintain: 'Maintain current weight',
  energy_mild: 'Mild fatigue / Energy boost',
  energy_chronic: 'Chronic fatigue recovery',
  recovery_athletic: 'Athletic recovery',
  muscle_building: 'Build muscle mass',
  body_recomposition: 'Body recomposition',
  anti_aging: 'Anti-aging / Longevity',
  cognitive_function: 'Cognitive enhancement',
  immune_support: 'Immune system support',
};

// ─── Component ──────────────────────────────────────────────

const AssessmentResults: React.FC = () => {
  const [searchParams] = useSearchParams();
  const assessmentId = searchParams.get('id');

  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [recommendations, setRecommendations] = useState<MatchedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!assessmentId) {
      setError('No assessment ID provided.');
      setLoading(false);
      return;
    }
    loadResults(assessmentId);
  }, [assessmentId]);

  const loadResults = async (id: string) => {
    try {
      // Fetch the assessment
      const { data: assessmentData, error: fetchError } = await supabase
        .from('assessment_responses')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !assessmentData) {
        setError('Assessment not found. Please check your link and try again.');
        setLoading(false);
        return;
      }

      setAssessment(assessmentData as AssessmentResponse);

      // Build recommendations from goals
      const goals: string[] = assessmentData.goals || [];
      const allRecs: MatchedRecommendation[] = [];
      const seenProducts = new Set<string>();

      for (const goal of goals) {
        const goalRecs = GOAL_RECOMMENDATIONS[goal];
        if (!goalRecs) continue;

        for (const rec of goalRecs) {
          if (!seenProducts.has(rec.product)) {
            allRecs.push({
              ...rec,
              goalKey: goal,
              goalLabel: GOAL_LABELS[goal] || goal,
            });
            seenProducts.add(rec.product);
          }
        }
      }

      // Try to match with real products from the database
      if (allRecs.length > 0) {
        const productNames = [...new Set(allRecs.map(r => r.product))];
        const orFilter = productNames.map(name => `name.ilike.%${name}%`).join(',');

        const { data: products } = await supabase
          .from('products')
          .select('id, name, image_url, base_price, purity_percentage')
          .or(orFilter);

        if (products && products.length > 0) {
          for (const rec of allRecs) {
            const matched = products.find(p =>
              p.name.toLowerCase().includes(rec.product.toLowerCase()) ||
              rec.product.toLowerCase().includes(p.name.toLowerCase())
            );
            if (matched) {
              rec.matchedProduct = matched;
            }
          }
        }

        // Save recommendations back to the assessment row
        const recsPayload = allRecs.map(r => ({
          product: r.product,
          reason: r.reason,
          priority: r.priority,
          goalKey: r.goalKey,
          matchedProductId: r.matchedProduct?.id || null,
        }));

        await supabase
          .from('assessment_responses')
          .update({ recommendation_generated: recsPayload, status: 'completed' })
          .eq('id', id);
      }

      setRecommendations(allRecs);

      // Expand first goal by default
      if (goals.length > 0) {
        setExpandedGoals(new Set([goals[0]]));
      }
    } catch (err) {
      console.error('Error loading assessment results:', err);
      setError('Something went wrong loading your results.');
    } finally {
      setLoading(false);
    }
  };

  const toggleGoal = (goal: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(goal)) next.delete(goal);
      else next.add(goal);
      return next;
    });
  };

  // Group recommendations by goal
  const recsByGoal = new Map<string, MatchedRecommendation[]>();
  for (const rec of recommendations) {
    const list = recsByGoal.get(rec.goalKey) || [];
    list.push(rec);
    recsByGoal.set(rec.goalKey, list);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-brand-50/20 to-white">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-4" />
          <p className="text-charcoal-600 font-medium">Generating your personalized recommendations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-brand-50/20 to-white px-4">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="font-heading text-2xl font-bold text-charcoal-900 mb-2">Oops</h2>
          <p className="text-charcoal-600 mb-6">{error}</p>
          <a href="/assessment" className="btn-primary inline-flex items-center gap-2">
            Take the Assessment
          </a>
        </div>
      </div>
    );
  }

  const primaryRecs = recommendations.filter(r => r.priority === 'primary');
  const supportingRecs = recommendations.filter(r => r.priority === 'supporting');

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-brand-50/20 to-white py-6 md:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <a
          href="/"
          className="inline-flex items-center gap-2 text-charcoal-500 hover:text-brand-600 mb-6 group text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Shop
        </a>

        {/* Hero */}
        <div className="bg-white rounded-2xl shadow-luxury border border-brand-100 p-8 md:p-10 mb-8 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <Sparkles className="w-8 h-8 text-brand-600" />
          </div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-charcoal-900 mb-3">
            Your Personalized Recommendations
          </h1>
          {assessment && (
            <p className="text-charcoal-500 text-lg">
              Hi <strong className="text-charcoal-800">{assessment.full_name.split(' ')[0]}</strong>, based on your assessment, here are our peptide recommendations for you.
            </p>
          )}
        </div>

        {/* Summary card */}
        {assessment && (
          <div className="bg-white rounded-2xl shadow-soft border border-charcoal-100 p-6 mb-8">
            <h3 className="font-heading text-lg font-bold text-charcoal-900 mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand-600" />
              Assessment Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-charcoal-400 text-xs uppercase font-bold tracking-wider mb-1">Age Range</p>
                <p className="text-charcoal-800 font-medium">{assessment.age_range}</p>
              </div>
              <div>
                <p className="text-charcoal-400 text-xs uppercase font-bold tracking-wider mb-1">Experience</p>
                <p className="text-charcoal-800 font-medium capitalize">{assessment.experience_level.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-charcoal-400 text-xs uppercase font-bold tracking-wider mb-1">Goals</p>
                <p className="text-charcoal-800 font-medium">{assessment.goals.length} selected</p>
              </div>
              <div>
                <p className="text-charcoal-400 text-xs uppercase font-bold tracking-wider mb-1">BMI</p>
                <p className="text-charcoal-800 font-medium">
                  {assessment.height_cm && assessment.weight_kg
                    ? (assessment.weight_kg / ((assessment.height_cm / 100) ** 2)).toFixed(1)
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Primary Recommendations */}
        {primaryRecs.length > 0 && (
          <div className="mb-8">
            <h2 className="font-heading text-xl font-bold text-charcoal-900 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-brand-500" />
              Primary Recommendations
            </h2>
            <div className="space-y-4">
              {primaryRecs.map((rec, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl shadow-soft border-2 border-brand-200 p-5 md:p-6 hover:shadow-luxury transition-all"
                >
                  <div className="flex items-start gap-4">
                    {rec.matchedProduct?.image_url ? (
                      <img
                        src={rec.matchedProduct.image_url}
                        alt={rec.product}
                        className="w-16 h-16 rounded-xl object-cover border border-charcoal-100 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                        <Package className="w-7 h-7 text-brand-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-heading text-lg font-bold text-charcoal-900">
                          {rec.matchedProduct?.name || rec.product}
                        </h3>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-brand-100 text-brand-700">
                          Primary
                        </span>
                      </div>
                      <p className="text-sm text-charcoal-600 mb-2">{rec.reason}</p>
                      <div className="flex items-center gap-4 text-xs text-charcoal-400">
                        <span className="bg-charcoal-50 px-2 py-1 rounded font-medium">
                          Goal: {rec.goalLabel}
                        </span>
                        {rec.matchedProduct?.base_price && (
                          <span className="font-bold text-brand-600">
                            Starting at ₱{rec.matchedProduct.base_price.toLocaleString()}
                          </span>
                        )}
                        {rec.matchedProduct?.purity_percentage && (
                          <span>{rec.matchedProduct.purity_percentage}% Purity</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Supporting Recommendations */}
        {supportingRecs.length > 0 && (
          <div className="mb-8">
            <h2 className="font-heading text-xl font-bold text-charcoal-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-charcoal-400" />
              Supporting Recommendations
            </h2>
            <div className="space-y-3">
              {supportingRecs.map((rec, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl shadow-soft border border-charcoal-100 p-4 md:p-5 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-4">
                    {rec.matchedProduct?.image_url ? (
                      <img
                        src={rec.matchedProduct.image_url}
                        alt={rec.product}
                        className="w-12 h-12 rounded-lg object-cover border border-charcoal-100 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-charcoal-50 flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-charcoal-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading font-bold text-charcoal-900">
                        {rec.matchedProduct?.name || rec.product}
                      </h3>
                      <p className="text-sm text-charcoal-500 mt-0.5">{rec.reason}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-charcoal-400">
                        <span className="bg-charcoal-50 px-2 py-1 rounded font-medium">
                          Goal: {rec.goalLabel}
                        </span>
                        {rec.matchedProduct?.base_price && (
                          <span className="font-bold text-charcoal-600">
                            ₱{rec.matchedProduct.base_price.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations by Goal (expandable) */}
        {recsByGoal.size > 0 && (
          <div className="mb-8">
            <h2 className="font-heading text-xl font-bold text-charcoal-900 mb-4">
              Breakdown by Goal
            </h2>
            <div className="space-y-3">
              {[...recsByGoal.entries()].map(([goalKey, goalRecs]) => (
                <div key={goalKey} className="bg-white rounded-xl shadow-soft border border-charcoal-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGoal(goalKey)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-charcoal-50/50 transition-colors"
                  >
                    <span className="font-bold text-charcoal-900 text-sm">
                      {GOAL_LABELS[goalKey] || goalKey}
                    </span>
                    {expandedGoals.has(goalKey) ? (
                      <ChevronUp className="w-4 h-4 text-charcoal-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-charcoal-400" />
                    )}
                  </button>
                  {expandedGoals.has(goalKey) && (
                    <div className="px-4 pb-4 space-y-2 border-t border-charcoal-50">
                      {goalRecs.map((rec, idx) => (
                        <div key={idx} className="flex items-center gap-3 pt-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            rec.priority === 'primary'
                              ? 'bg-brand-100 text-brand-700'
                              : 'bg-charcoal-100 text-charcoal-600'
                          }`}>
                            {rec.priority}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-charcoal-800">
                              {rec.matchedProduct?.name || rec.product}
                            </p>
                            <p className="text-xs text-charcoal-500">{rec.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="bg-brand-50/40 rounded-xl p-5 border border-brand-100 mb-8">
          <p className="text-xs text-charcoal-600 leading-relaxed">
            <strong>Disclaimer:</strong> These recommendations are for educational and informational purposes only.
            They are not medical advice and should not replace consultation with a licensed healthcare provider.
            Individual results may vary. Always consult a qualified medical professional before starting any peptide protocol.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center space-y-3">
          <a
            href="/"
            className="btn-primary inline-flex items-center gap-2"
          >
            <Package className="w-4 h-4" />
            Browse Our Products
          </a>
          <p className="text-xs text-charcoal-400">
            Have questions? Contact us via Viber or WhatsApp at <strong>0947 506 7148</strong>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AssessmentResults;
