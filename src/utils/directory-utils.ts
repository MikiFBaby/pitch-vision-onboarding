import { supabase } from "@/lib/supabase-client";

export interface DirectoryEmployee {
    id: string;
    first_name: string;
    last_name: string;
    role: string | null;
    email: string | null;
}

export const getEmployeesByRole = async (roleKeyword: string): Promise<DirectoryEmployee[]> => {
    try {
        const { data, error } = await supabase
            .from("employee_directory")
            .select("id, first_name, last_name, role, email")
            .ilike('role', `%${roleKeyword}%`);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error(`Error fetching employees for role ${roleKeyword}:`, error);
        return [];
    }
};

export const findBestMatchEmployee = async (query: string): Promise<DirectoryEmployee | null> => {
    // Try role first
    const byRole = await getEmployeesByRole(query);
    if (byRole.length > 0) return byRole[0];

    // Try name
    const { data: byName } = await supabase
        .from("employee_directory")
        .select("id, first_name, last_name, role, email")
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(1);

    return byName?.[0] || null;
};

export const searchDirectory = async (query: string): Promise<DirectoryEmployee[]> => {
    try {
        const { data, error } = await supabase
            .from("employee_directory")
            .select("id, first_name, last_name, role, email")
            .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,role.ilike.%${query}%`)
            .limit(5);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error(`Error searching directory for ${query}:`, error);
        return [];
    }
};
