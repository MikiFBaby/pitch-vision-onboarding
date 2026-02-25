import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('pitch_points_store_items')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, items: data || [] });
  } catch (error) {
    console.error('Error fetching store items:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, category, point_cost, image_url, stock_quantity, is_featured, requires_approval, fulfillment_instructions, tags, metadata, created_by } = body;

    if (!name || !category || !point_cost) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, category, point_cost' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('pitch_points_store_items')
      .insert({
        name,
        description: description || null,
        category,
        point_cost,
        image_url: image_url || null,
        stock_quantity: stock_quantity ?? null,
        is_featured: is_featured || false,
        requires_approval: requires_approval !== false,
        fulfillment_instructions: fulfillment_instructions || null,
        tags: tags || [],
        metadata: metadata || {},
        created_by: created_by || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, item: data });
  } catch (error) {
    console.error('Error creating store item:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing item id' }, { status: 400 });
    }

    const body = await request.json();
    body.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('pitch_points_store_items')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, item: data });
  } catch (error) {
    console.error('Error updating store item:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing item id' }, { status: 400 });
    }

    // Soft delete
    const { error } = await supabaseAdmin
      .from('pitch_points_store_items')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting store item:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
