import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOrCreateBalance, redeemPoints, getConfig } from '@/utils/pitch-points-utils';

export async function POST(request: NextRequest) {
  try {
    const { userId, storeItemId, agentNotes } = await request.json();

    if (!userId || !storeItemId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId or storeItemId' },
        { status: 400 },
      );
    }

    const config = await getConfig();
    if (!config.store_enabled) {
      return NextResponse.json(
        { success: false, error: 'The reward store is currently closed' },
        { status: 403 },
      );
    }

    // Fetch the store item
    const { data: item, error: itemError } = await supabaseAdmin
      .from('pitch_points_store_items')
      .select('*')
      .eq('id', storeItemId)
      .eq('is_active', true)
      .maybeSingle();

    if (itemError || !item) {
      return NextResponse.json(
        { success: false, error: 'Store item not found or inactive' },
        { status: 404 },
      );
    }

    // Check stock
    if (item.stock_quantity !== null && item.stock_quantity <= 0) {
      return NextResponse.json(
        { success: false, error: 'This item is out of stock' },
        { status: 400 },
      );
    }

    // Check balance
    const balance = await getOrCreateBalance(userId);
    if (balance.current_balance < item.point_cost) {
      return NextResponse.json(
        { success: false, error: `Insufficient balance. You need ${item.point_cost} points but have ${balance.current_balance}` },
        { status: 400 },
      );
    }

    // Create the debit transaction
    const transaction = await redeemPoints(
      userId,
      item.point_cost,
      storeItemId,
      `Redeemed: ${item.name}`,
      balance.employee_id,
    );

    // Create the redemption record
    const { data: redemption, error: redemptionError } = await supabaseAdmin
      .from('pitch_points_redemptions')
      .insert({
        user_id: userId,
        employee_id: balance.employee_id,
        store_item_id: storeItemId,
        transaction_id: transaction.id,
        point_cost: item.point_cost,
        status: 'pending',
        agent_notes: agentNotes || null,
      })
      .select()
      .single();

    if (redemptionError) throw redemptionError;

    // Decrement stock if applicable
    if (item.stock_quantity !== null) {
      await supabaseAdmin
        .from('pitch_points_store_items')
        .update({ stock_quantity: item.stock_quantity - 1 })
        .eq('id', storeItemId);
    }

    return NextResponse.json({
      success: true,
      redemption,
      newBalance: transaction.balance_after,
    });
  } catch (error) {
    console.error('Error processing redemption:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
